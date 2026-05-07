from __future__ import annotations

import hashlib
import json
import os
import re
import time
from typing import Any, Dict, List, Optional, Set
import xml.etree.ElementTree as ET

import requests

from ..models import Node, Question, Session


_ALLOWED_ISSUE = {"CRITICAL", "MISSING", "VARIANT", "AMBIG", "LOSS"}
_LLM_QUESTIONS_TIMEOUT_SEC = 90


def _report_debug_enabled() -> bool:
    return str(os.environ.get("REPORT_DEBUG_LOG") or "").strip().lower() in {"1", "true", "yes", "on"}


def _report_debug_log(tag: str, **fields: Any) -> None:
    if not _report_debug_enabled():
        return
    parts: List[str] = []
    for key, value in fields.items():
        key_text = str(key or "").strip()
        if not key_text:
            continue
        text = str(value if value is not None else "").replace("\n", "\\n").strip()
        parts.append(f"{key_text}={text}")
    suffix = f" {' '.join(parts)}" if parts else ""
    print(f"[{str(tag or 'REPORT').strip()}]{suffix}")


_PROCESS_DOMAIN_CONTEXT: Dict[str, Any] = {
    "domain": "food_production_and_cooking",
    "goal": "Собрать максимально подробный и исполнимый процесс приготовления блюда.",
    "principles": [
        "Не придумывать новые ветки процесса без оснований в контексте.",
        "Выявлять пропущенные банальные шаги (подготовка, передача, контроль, фиксация, санитария).",
        "Уточнять входы/выходы шага, исполнителя, оборудование, критерии завершения и риск потерь.",
        "Формулировать вопросы прикладно и операционно, чтобы по ответам можно было сразу доописать BPMN/Interview.",
    ],
    "focus_areas": [
        "handoff_between_roles",
        "equipment_and_inventory_handling",
        "quality_and_safety_checks",
        "timing_and_wait_conditions",
        "exceptions_and_rework",
        "physical_inputs_outputs",
    ],
}

_LLM_QUESTION_POLICY_PROMPT = """ВХОДНЫЕ ДАННЫЕ
Ты получишь:
1) bpmn_xml ИЛИ parsed_bpmn_json (одно из них)
2) опционально memory: already_asked[], answers{}
3) опционально constraints: max_questions (по умолчанию 10)

КРИТИЧЕСКИЙ ИСТОЧНИК КОНТЕКСТА
Весь контекст берётся ТОЛЬКО из BPMN:
- Название процесса: из <bpmn:process name="...">
- Тема/потребность: из StartEvent name
- Исполнители: из lane names (дорожки)
- Существующие шаги: из узлов BPMN и их названий
Запрещено придумывать новые ветки или новые шаги, если их не подразумевает BPMN-семантика.

НЕПРИКОСНОВЕННЫЕ ПРИНЦИПЫ
1) Не выдумывай ветки. Не добавляй “возможно вы делаете X”, если BPMN этого не требует.
2) 1 вопрос = 1 недостающий факт (одна “дыра”).
3) Вопросы только прикладные: кто/что/сколько/чем/когда/как проверить.
4) Для измеримых значений всегда требуй единицы: г, мл, °C, мин, %, pH и т.п.
5) Где возможно — используй закрытые ответы (выбор/число+единица).
6) Не повторяй уже заданные/отвеченные вопросы (используй memory).
7) Приоритизируй то, что разблокирует исполнение и корректность BPMN.

ЧТО СЧИТАЕТСЯ “ДЫРОЙ” (НЕДОСТАЮЩЕЙ ИНФОРМАЦИЕЙ)
Для каждого узла/шлюза/события выявляй отсутствие:
- Timer events: нет timeDuration / нет объективного критерия “когда сработало”.
- Gateways: нет измеримого критерия решения (что значит “Да/Нет”) и что делать по “Нет”.
- Tasks: нет входов/выходов, нет оборудования/инструмента, нет времени/температуры, нет критерия завершения, нет QC/CCP, нет фиксации/маркировки, нет условия передачи.
- Handoffs: нет кому/как передаётся и как принимается (критерий приемки).
- Multi-instance subprocess: не ясно, по чему идёт цикл (коллекция), как считаем итерации, условие завершения, логирование.

ПОРЯДОК ПРИОРИТЕТОВ (ИСПОЛЬЗУЙ ЕГО)
P1) Шлюзы: критерий “Да/Нет” + действие на “Нет” (доварить/переделать/списать/уведомить).
P1) Таймеры: точная длительность ИЛИ сенсорный/наблюдаемый критерий + допустимый диапазон.
P2) Определение “готово” для ключевых вех/конца процесса.
P2) Входы/выходы для шагов передачи/перемещения материалов.
P3) Режимы температура/время + как именно проверяют (термометр/датчик/визуально).
P3) QC/CCP + что фиксируем в журнале/маркировке.
P4) Санитария/мойка — только когда BPMN явно затрагивает оборудование/перелив/перенос (не добавляй новых шагов; уточняй как делают).
P4) Риски потерь/брака — только для шагов, где риск очевидно подразумевается.

ФОРМАТ ВЫХОДА (СТРОГО JSON, БЕЗ ТЕКСТА СНАРУЖИ)
Верни JSON-объект:
- "start_context": кратко извлечённый контекст из BPMN (process_name, start_event_name, lanes/actors).
- "questions": массив объектов, каждый:
  {
    "question_id": "Q001",
    "priority": 1,
    "node_id": "Activity_0ipsbez",
    "node_name": "Перевести котел в режим охлаждения до 80 градусов",
    "type": "time_temp|done_criteria|inputs_outputs|qc_ccp|sanitation|handoff|timer|gateway_criterion|logging|loss_risk",
    "question": "…",
    "expected_answer_format": "choice|number_with_unit|short_text",
    "choices": ["…"] (только если expected_answer_format=choice),
    "bpmn_patch_hint": {
      "target": "node|gateway|event",
      "field": "timeDuration|criterion|inputs|outputs|equipment|actor|done_criteria|qc_check|record|handoff_to|zeebe_property",
      "value_type": "string|number|number_with_unit|enum|json"
    }
  }
- "coverage": {
    "missing_top": [ { "node_id": "...", "gap": "...", "why_important": "..." } ],
    "skipped_duplicates": [ "Qxxx", ... ]
  }

ЖЁСТКИЕ ПРАВИЛА
- Максимум вопросов: max_questions (по умолчанию 10). Если критичных дыр больше — отдай топ и остальное перечисли в coverage.missing_top.
- Не пересказывай BPMN целиком.
- Не выдавай рассуждений, только JSON.
- Если дыр нет — верни пустой "questions": [] и coverage.missing_top: []."""

_SESSION_TITLE_PROMPT_TEMPLATE = """Ты — методолог интервью и аналитик пищевого производства. Твоя задача — вернуть КОРОТКИЙ, но максимально полезный список ПРИОРИТЕТНЫХ вопросов для первого интервью, чтобы затем можно было:
1) написать DoD (Definition of Done) процесса,
2) и только потом построить BPMN без идеализаций.

Объект интервью: {{НАЗВАНИЕ}} (это блюдо или процесс с участием блюда).
НЕ делай предположений. Если непонятно, что именно подразумевается — начни с 1 уточняющего вопроса и дальше продолжай.

Правила:
- Язык простой, приземлённый, “как на производстве”.
- Только вопросы. Не предлагай улучшений и решений.
- Проси числа там, где они нужны: время, температуры, веса, сроки, допуски.
- Вопросы должны быть такими, чтобы на них ответили технолог/мастер смены/исполнитель.
- Приоритизируй: включай только то, без чего DoD и BPMN будут “дырявыми”.

Формат ответа (строго):
Верни 15–20 вопросов, сгруппированных по 6 блокам.
Для каждого вопроса укажи:
- ID (Q1…)
- Вопрос (1–2 предложения)
- Кому адресовать (роль)
- Тип ответа (число / коротко / список / да-нет + условия)
- Follow-up (1 уточняющий вопрос, если ответ размытый)

Блоки (строго 6):
A) Границы и “готово” (старт/финиш/что считаем сделано)
B) Входы/выходы и варианты (что приходит, что уходит, какие варианты/аллергены обязательно учесть)
C) Роли и ответственность (кто делает, кто проверяет, кто решает при проблеме)
D) Критичные правила безопасности/качества (температуры/время/аллергены/CCP и что делаем при отклонениях)
E) Зоны/маршруты и санитария (где делаем и как не смешиваем сырьё/готовое/грязное/аллергены)
F) Исключения и фиксация данных (топ-5 сбоев и что записываем, чтобы процесс был управляемым)

Приоритетность:
- В каждом блоке сначала самые важные вопросы (без них нельзя).
- Избегай общих вопросов “расскажите”. Задавай конкретно “кто/что/где/когда/сколько/что если”.

Выведи вопросы сразу, без вступлений и без текста вне заданного формата."""

_PATH_REPORT_PROMPT_TEMPLATE_V1 = """Ты — аналитик операционных процессов пищевого производства.
Твоя задача: по входному payload (ручной путь шагов) сформировать структурированный AI-отчёт.

ОГРАНИЧЕНИЯ
- Используй только данные из payload. Не придумывай отсутствующие шаги.
- Порядок шагов интерпретируй строго по order_index.
- Не сортируй шаги по времени или названию.
- Не ссылайся на BPMN XML целиком; работай только с переданным списком шагов.

ЧТО НУЖНО ВЫДАТЬ
1) report_markdown: структурированный отчёт (кратко и по делу)
2) recommendations: рекомендации по процессу
   - scope=\"global\" для общих
   - scope=\"step\" для рекомендаций к конкретному шагу (обязательно укажи order_index)
3) missing_data: каких данных не хватает (например work/wait/input/output/notes)
4) risks: риски и контрольные точки, при наличии — привяжи к шагам через step_order_indexes

ФОРМАТ ОТВЕТА
Верни СТРОГО JSON-объект БЕЗ текста снаружи:
{
  "report_markdown": "...",
  "recommendations": [
    { "scope": "global", "text": "...", "expected_effect": "..." },
    { "scope": "step", "order_index": 12, "text": "...", "expected_effect": "..." }
  ],
  "missing_data": [
    { "order_index": 5, "missing": ["work_duration_sec", "wait_duration_sec"] }
  ],
  "risks": [
    { "text": "...", "step_order_indexes": [30, 31] }
  ]
}
"""

_PATH_REPORT_PROMPT_TEMPLATE_V2 = """Ты — аналитик операционных процессов пищевого производства.
Сформируй СТРУКТУРИРОВАННЫЙ отчёт только на основе входного payload.

ОГРАНИЧЕНИЯ
- Нельзя придумывать отсутствующие шаги и данные.
- Порядок шагов строго по order_index.
- Если данных нет — ставь null или пустые массивы.
- Верни только JSON, без пояснений вне JSON.

ФОРМАТ (строго):
{
  "title": "Короткий заголовок отчёта",
  "summary": ["Ключевое наблюдение 1", "Ключевое наблюдение 2"],
  "kpis": {
    "steps_count": 0,
    "work_total_sec": 0,
    "wait_total_sec": 0,
    "total_sec": 0,
    "coverage": {
      "missing_work_duration_pct": 0,
      "missing_wait_duration_pct": 0,
      "missing_notes_pct": 0
    }
  },
  "bottlenecks": [
    { "order_index": 0, "title": "Шаг", "reason": "Причина", "impact": "Влияние" }
  ],
  "recommendations": [
    {
      "scope": "global",
      "priority": "P0",
      "text": "Рекомендация",
      "effect": "Ожидаемый эффект",
      "effort": "Сложность/затраты"
    },
    {
      "scope": "step",
      "priority": "P1",
      "order_index": 12,
      "text": "Рекомендация к шагу",
      "effect": "Ожидаемый эффект",
      "effort": "Сложность/затраты"
    }
  ],
  "missing_data": [
    { "order_index": 12, "missing": ["work_duration_sec", "notes"] }
  ],
  "report_markdown": "необязательно, можно пусто"
}
"""


def _sha12(s: str) -> str:
    h = hashlib.sha1(s.encode("utf-8")).hexdigest()[:12]
    return h


def _stable_qid(node_id: str, field: str, question: str) -> str:
    base = f"{node_id}|{field}|{question}"
    return f"llm_{_sha12(base)}"


def _strip_fences(text: str) -> str:
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", t)
        t = re.sub(r"\s*```\s*$", "", t)
    return t.strip()


def _extract_json_candidate(text: str) -> Optional[str]:
    t = _strip_fences(text)
    if not t:
        return None

    # if it's already json-ish
    if (t.startswith("{") and t.endswith("}")) or (t.startswith("[") and t.endswith("]")):
        return t

    # find first {...} or [...] block
    m = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", t)
    if m:
        return m.group(1)
    return None


def _extract_json_string_field_loose(text: str, field_name: str) -> str:
    raw = str(text or "")
    key = f"\"{str(field_name or '').strip()}\""
    if not raw or not key:
        return ""
    idx = raw.find(key)
    if idx < 0:
        return ""
    colon = raw.find(":", idx + len(key))
    if colon < 0:
        return ""
    quote = raw.find("\"", colon + 1)
    if quote < 0:
        return ""
    i = quote + 1
    buf: List[str] = []
    escaped = False
    while i < len(raw):
        ch = raw[i]
        if escaped:
            buf.append(ch)
            escaped = False
            i += 1
            continue
        if ch == "\\":
            buf.append(ch)
            escaped = True
            i += 1
            continue
        if ch == "\"":
            tail = raw[i + 1:]
            tail_trim = tail.lstrip()
            if tail_trim.startswith(",") or tail_trim.startswith("}") or tail_trim.startswith("```"):
                break
            buf.append(ch)
            i += 1
            continue
        buf.append(ch)
        i += 1
    payload = "".join(buf)
    if not payload:
        return ""
    try:
        return str(json.loads(f"\"{payload}\"") or "").strip()
    except Exception:
        return (
            payload
            .replace("\\n", "\n")
            .replace("\\r", "\r")
            .replace("\\t", "\t")
            .replace("\\\"", "\"")
        ).strip()


def _extract_report_markdown_from_raw_text(raw_text: str) -> str:
    raw = str(raw_text or "").strip()
    if not raw:
        return ""
    candidate = _extract_json_candidate(raw)
    if candidate:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                md = str(parsed.get("report_markdown") or "").strip()
                if md:
                    return md
        except Exception:
            pass
    fenced = _strip_fences(raw)
    md = _extract_json_string_field_loose(fenced, "report_markdown")
    if md:
        return md
    return ""


def _kpis_fallback_from_payload(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    src = payload if isinstance(payload, dict) else {}
    totals = src.get("totals") if isinstance(src.get("totals"), dict) else {}
    coverage_src = src.get("missing_fields_coverage") if isinstance(src.get("missing_fields_coverage"), dict) else {}
    return {
        "steps_count": _to_non_negative_int(totals.get("steps_count")),
        "work_total_sec": _to_non_negative_int(totals.get("work_total_sec")),
        "wait_total_sec": _to_non_negative_int(totals.get("wait_total_sec")),
        "total_sec": _to_non_negative_int(totals.get("total_sec")),
        "coverage": {
            "missing_work_duration_pct": _to_percent_or_none(coverage_src.get("missing_work_duration_pct")),
            "missing_wait_duration_pct": _to_percent_or_none(coverage_src.get("missing_wait_duration_pct")),
            "missing_notes_pct": _to_percent_or_none(coverage_src.get("missing_notes_pct")),
        },
    }


def _to_non_negative_int_or_zero(value: Any, *, fallback: Any = None) -> int:
    n = _to_non_negative_int(value)
    if n is not None:
        return int(n)
    fb = _to_non_negative_int(fallback)
    return int(fb if fb is not None else 0)


def _normalize_summary_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item or "").strip() for item in value if str(item or "").strip()]
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    return []


def _normalize_recommendations_list(value: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if isinstance(value, str):
        text = value.strip()
        if text:
            out.append({"scope": "global", "text": text, "expected_effect": ""})
        return out
    if not isinstance(value, list):
        return out
    for item in value:
        if isinstance(item, str):
            text = item.strip()
            if text:
                out.append({"scope": "global", "text": text, "expected_effect": ""})
            continue
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or item.get("recommendation") or "").strip()
        if not text:
            continue
        scope = str(item.get("scope") or "").strip().lower()
        if scope not in {"global", "step"}:
            scope = "global"
        row: Dict[str, Any] = {
            "scope": scope,
            "text": text,
            "expected_effect": str(item.get("expected_effect") or item.get("effect") or "").strip(),
        }
        priority = str(item.get("priority") or "").strip().upper()
        if priority in {"P0", "P1", "P2"}:
            row["priority"] = priority
        order_index = _to_non_negative_int(item.get("order_index"))
        if scope == "step" and order_index and order_index > 0:
            row["order_index"] = int(order_index)
        effort = str(item.get("effort") or "").strip()
        if effort:
            row["effort"] = effort
        out.append(row)
    return out


def _normalize_missing_data_list(value: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if isinstance(value, str):
        text = value.strip()
        if text:
            out.append({"order_index": None, "missing": [text]})
        return out
    if not isinstance(value, list):
        return out
    for item in value:
        if isinstance(item, str):
            text = item.strip()
            if text:
                out.append({"order_index": None, "missing": [text]})
            continue
        if not isinstance(item, dict):
            continue
        order_index = _to_non_negative_int(item.get("order_index"))
        miss_raw = item.get("missing")
        if isinstance(miss_raw, list):
            missing = [str(x or "").strip() for x in miss_raw if str(x or "").strip()]
        elif isinstance(miss_raw, str):
            missing = [miss_raw.strip()] if miss_raw.strip() else []
        else:
            missing = []
        if not missing and not (order_index and order_index > 0):
            continue
        out.append(
            {
                "order_index": int(order_index) if order_index and order_index > 0 else None,
                "missing": missing,
            }
        )
    return out


def _normalize_risks_list(value: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if isinstance(value, str):
        text = value.strip()
        if text:
            out.append({"text": text, "step_order_indexes": []})
        return out
    if not isinstance(value, list):
        return out
    for item in value:
        if isinstance(item, str):
            text = item.strip()
            if text:
                out.append({"text": text, "step_order_indexes": []})
            continue
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or item.get("risk") or "").strip()
        if not text:
            continue
        indexes: List[int] = []
        for raw_idx in (item.get("step_order_indexes") or []):
            idx = _to_non_negative_int(raw_idx)
            if idx and idx > 0:
                indexes.append(int(idx))
        out.append({"text": text, "step_order_indexes": indexes})
    return out


def _normalize_improvements_top5(value: Any, recommendations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if isinstance(value, str):
        text = value.strip()
        if text:
            out.append({"text": text})
    elif isinstance(value, list):
        for item in value:
            if isinstance(item, str):
                text = item.strip()
                if text:
                    out.append({"text": text})
                continue
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or item.get("title") or "").strip()
            if not text:
                continue
            row = {"text": text}
            priority = str(item.get("priority") or "").strip().upper()
            if priority in {"P0", "P1", "P2"}:
                row["priority"] = priority
            out.append(row)
    if out:
        return out[:5]
    fallback = []
    for rec in recommendations[:5]:
        text = str((rec or {}).get("text") or "").strip()
        if not text:
            continue
        row = {"text": text}
        priority = str((rec or {}).get("priority") or "").strip().upper()
        if priority in {"P0", "P1", "P2"}:
            row["priority"] = priority
        fallback.append(row)
    return fallback[:5]


def _build_report_markdown_from_payload_v2(payload_raw: Any) -> str:
    payload = payload_raw if isinstance(payload_raw, dict) else {}
    title = str(payload.get("title") or "").strip() or "AI-отчёт по процессу"
    summary = _normalize_summary_list(payload.get("summary"))
    kpis = payload.get("kpis") if isinstance(payload.get("kpis"), dict) else {}
    lines: List[str] = [f"## {title}", ""]
    lines.append("### Summary")
    if summary:
        lines.extend([f"- {item}" for item in summary])
    else:
        lines.append("- Структурированный ответ модели не получен; показаны нормализованные данные.")
    lines.extend(
        [
            "",
            "### KPIs",
            f"- steps_count: {_to_non_negative_int_or_zero(kpis.get('steps_count'))}",
            f"- work_total_sec: {_to_non_negative_int_or_zero(kpis.get('work_total_sec'))}",
            f"- wait_total_sec: {_to_non_negative_int_or_zero(kpis.get('wait_total_sec'))}",
            f"- total_sec: {_to_non_negative_int_or_zero(kpis.get('total_sec'))}",
        ]
    )
    return "\n".join(lines).strip()


def _looks_like_raw_json_blob(text_raw: str) -> bool:
    text = str(text_raw or "").strip()
    if not text:
        return False
    if text.startswith("```json") or text.startswith("```"):
        return True
    if (text.startswith("{") and text.endswith("}")) or (text.startswith("[") and text.endswith("]")):
        return True
    return False


def normalize_deepseek_report_payload(
    raw: Any,
    *,
    payload: Optional[Dict[str, Any]] = None,
    raw_text: str = "",
) -> Dict[str, Any]:
    user_payload = payload if isinstance(payload, dict) else {}
    fallback_kpis = _kpis_fallback_from_payload(user_payload)

    source_obj: Dict[str, Any] = {}
    payload_raw: Any = raw
    raw_text_value = str(raw_text or "").strip()
    warnings: List[str] = []

    if isinstance(raw, dict):
        source_obj = raw
    elif isinstance(raw, str):
        text = raw.strip()
        if text and not raw_text_value:
            raw_text_value = text
        candidate = _extract_json_candidate(text)
        if candidate:
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    source_obj = parsed
                    payload_raw = parsed
                else:
                    warnings.append("invalid_json_object")
            except Exception:
                warnings.append("json_parse_failed")
        elif text:
            warnings.append("json_candidate_not_found")
    elif raw is not None:
        warnings.append("invalid_json_object")

    report_obj = source_obj
    if isinstance(source_obj.get("report_json"), dict):
        report_obj = source_obj.get("report_json") or {}

    title = (
        str(report_obj.get("title") or "").strip()
        or str(source_obj.get("title") or "").strip()
        or "AI-отчёт по процессу"
    )
    summary = _normalize_summary_list(report_obj.get("summary"))
    if not summary:
        summary = _normalize_summary_list(source_obj.get("summary"))

    kpis_src = report_obj.get("kpis") if isinstance(report_obj.get("kpis"), dict) else {}
    if not kpis_src and isinstance(source_obj.get("kpis"), dict):
        kpis_src = source_obj.get("kpis") or {}
    kpis = {
        "steps_count": _to_non_negative_int_or_zero(
            kpis_src.get("steps_count"),
            fallback=source_obj.get("steps_count") if source_obj else fallback_kpis.get("steps_count"),
        ),
        "work_total_sec": _to_non_negative_int_or_zero(
            kpis_src.get("work_total_sec"),
            fallback=source_obj.get("work_total_sec") if source_obj else fallback_kpis.get("work_total_sec"),
        ),
        "wait_total_sec": _to_non_negative_int_or_zero(
            kpis_src.get("wait_total_sec"),
            fallback=source_obj.get("wait_total_sec") if source_obj else fallback_kpis.get("wait_total_sec"),
        ),
        "total_sec": _to_non_negative_int_or_zero(
            kpis_src.get("total_sec"),
            fallback=source_obj.get("total_sec") if source_obj else fallback_kpis.get("total_sec"),
        ),
    }

    recommendations = _normalize_recommendations_list(report_obj.get("recommendations"))
    if not recommendations:
        recommendations = _normalize_recommendations_list(source_obj.get("recommendations"))

    missing_data = _normalize_missing_data_list(report_obj.get("missing_data"))
    if not missing_data:
        missing_data = _normalize_missing_data_list(source_obj.get("missing_data"))

    risks = _normalize_risks_list(report_obj.get("risks"))
    if not risks:
        risks = _normalize_risks_list(source_obj.get("risks"))

    improvements_top5 = _normalize_improvements_top5(
        report_obj.get("improvements_top5", source_obj.get("improvements_top5")),
        recommendations,
    )

    if not summary:
        summary = ["Структурированный ответ модели не получен; отчёт нормализован из доступных данных."]

    normalized: Dict[str, Any] = {
        "title": title,
        "kpis": kpis,
        "summary": summary,
        "recommendations": recommendations,
        "improvements_top5": improvements_top5,
        "missing_data": missing_data,
        "risks": risks,
    }

    bottlenecks = report_obj.get("bottlenecks")
    if isinstance(bottlenecks, list):
        normalized["bottlenecks"] = bottlenecks
    else:
        normalized["bottlenecks"] = []

    if not raw_text_value and not source_obj and raw is not None:
        raw_text_value = str(raw).strip()
    if raw_text_value:
        normalized["raw_text"] = raw_text_value

    return {
        "payload_normalized": normalized,
        "payload_raw": payload_raw if payload_raw is not None else {},
        "raw_text": raw_text_value,
        "warnings": warnings,
    }


def normalizeDeepSeekReport(raw: Any, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Backward-compatible camelCase alias for ReportPayload.v2 best-effort normalizer."""
    return normalize_deepseek_report_payload(raw, payload=payload)


def _deepseek_chat_json(
    api_key: str,
    base_url: str,
    messages: List[Dict[str, str]],
    timeout: int = 30,
    max_tokens: Optional[int] = None,
) -> Any:
    api_key = (api_key or "").strip()
    if not api_key:
        raise ValueError("no api key")
    base = (base_url or "https://api.deepseek.com").strip().rstrip("/")

    data = _deepseek_chat_request(
        api_key=api_key,
        base_url=base,
        messages=messages,
        temperature=0.0,
        timeout=timeout,
        max_tokens=max_tokens,
    )
    content = data["choices"][0]["message"]["content"]

    cand = _extract_json_candidate(content)
    if not cand:
        raise ValueError("no json in response")

    return json.loads(cand)


def _deepseek_chat_text(
    api_key: str,
    base_url: str,
    messages: List[Dict[str, str]],
    timeout: int = 30,
    max_tokens: Optional[int] = None,
) -> str:
    api_key = (api_key or "").strip()
    if not api_key:
        raise ValueError("no api key")
    base = (base_url or "https://api.deepseek.com").strip().rstrip("/")

    data = _deepseek_chat_request(
        api_key=api_key,
        base_url=base,
        messages=messages,
        temperature=0.2,
        timeout=timeout,
        max_tokens=max_tokens,
    )
    content = str((((data.get("choices") or [{}])[0] or {}).get("message") or {}).get("content") or "")
    return content.strip()


def _is_retryable_deepseek_error(exc: Exception) -> bool:
    if isinstance(exc, (requests.exceptions.Timeout, requests.exceptions.ConnectionError, requests.exceptions.ChunkedEncodingError)):
        return True
    if isinstance(exc, requests.exceptions.HTTPError):
        status = int(getattr(getattr(exc, "response", None), "status_code", 0) or 0)
        if status in {408, 409, 425, 429, 500, 502, 503, 504}:
            return True
    msg = str(exc or "").strip().lower()
    if not msg:
        return False
    retry_tokens = (
        "response ended prematurely",
        "incomplete read",
        "connection aborted",
        "connection reset",
        "timed out",
        "temporarily unavailable",
        "remote disconnected",
    )
    return any(tok in msg for tok in retry_tokens)


def _deepseek_chat_request(
    *,
    api_key: str,
    base_url: str,
    messages: List[Dict[str, str]],
    temperature: float,
    timeout: int,
    max_tokens: Optional[int] = None,
    max_attempts: int = 3,
    retry_backoff_sec: float = 0.8,
) -> Dict[str, Any]:
    payload = {
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": float(temperature),
    }
    mt = int(max_tokens or 0)
    if mt > 0:
        payload["max_tokens"] = mt
    url = f"{base_url}/v1/chat/completions"
    attempts = max(1, int(max_attempts or 1))
    backoff = max(0.0, float(retry_backoff_sec or 0.0))
    last_exc: Optional[Exception] = None
    read_timeout = max(10, int(timeout or 0))
    connect_timeout = max(3, min(15, read_timeout))
    for attempt in range(1, attempts + 1):
        try:
            r = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Accept-Encoding": "identity",
                    "Connection": "close",
                },
                json=payload,
                timeout=(connect_timeout, read_timeout),
            )
            r.raise_for_status()
            data = r.json()
            if isinstance(data, dict):
                return data
            raise ValueError("invalid_json_root")
        except Exception as exc:
            last_exc = exc
            if attempt >= attempts or not _is_retryable_deepseek_error(exc):
                raise
            sleep_for = backoff * attempt
            if sleep_for > 0:
                time.sleep(sleep_for)
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("deepseek request failed")


def _build_session_title_prompt(title: str, prompt_template: str = "") -> str:
    tpl = str(prompt_template or "").strip() or _SESSION_TITLE_PROMPT_TEMPLATE
    name = str(title or "").strip() or "Процесс"
    return tpl.replace("{{НАЗВАНИЕ}}", name)


def _sanitize_block_name(raw: str) -> str:
    t = re.sub(r"\s+", " ", str(raw or "").strip())
    if not t:
        return ""
    t = re.sub(r"^[A-FА-Е]\)\s*", "", t, flags=re.IGNORECASE)
    return t.strip()


def _parse_session_title_questions(raw: str, min_questions: int = 15, max_questions: int = 20) -> List[Dict[str, str]]:
    text = str(raw or "").strip()
    if not text:
        return []

    max_q = min(max(int(max_questions or 20), 1), 25)
    min_q = min(max(int(min_questions or 15), 1), max_q)

    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.replace("\r", "").split("\n")]
    current_block = ""
    current: Dict[str, str] = {}
    current_field = ""
    out: List[Dict[str, str]] = []
    seen_ids: Set[str] = set()

    def _push_current():
        nonlocal current, current_field
        qid = str(current.get("id") or "").strip().upper()
        qtxt = str(current.get("question") or "").strip()
        if not qid:
            qid = f"Q{len(out) + 1}"
        if not qtxt:
            current = {}
            current_field = ""
            return
        if qid in seen_ids:
            qid = f"Q{len(out) + 1}"
        seen_ids.add(qid)
        out.append(
            {
                "id": qid,
                "block": current.get("block") or current_block or "",
                "question": qtxt,
                "ask_to": str(current.get("ask_to") or "").strip(),
                "answer_type": str(current.get("answer_type") or "").strip(),
                "follow_up": str(current.get("follow_up") or "").strip(),
            }
        )
        current = {}
        current_field = ""

    for ln in lines:
        if not ln:
            continue
        t = re.sub(r"^[\-\*\u2022]+\s*", "", ln).strip()
        if not t:
            continue

        if re.match(r"^[A-FА-Е]\)\s*", t, flags=re.IGNORECASE):
            current_block = _sanitize_block_name(t)
            continue

        m_q_inline = re.match(r"^(Q\d+)\s*[:\.\-]\s*(.+)$", t, flags=re.IGNORECASE)
        if m_q_inline:
            _push_current()
            current["id"] = m_q_inline.group(1).upper()
            current["question"] = m_q_inline.group(2).strip()
            current["block"] = current_block
            current_field = "question"
            continue

        low = t.lower()
        if low.startswith("id"):
            m = re.search(r"(Q\d+)", t, flags=re.IGNORECASE)
            if m:
                _push_current()
                current["id"] = m.group(1).upper()
                current["block"] = current_block
            current_field = ""
            continue
        if low.startswith("вопрос"):
            val = t.split(":", 1)[1].strip() if ":" in t else ""
            if val:
                current["question"] = val
                current["block"] = current_block
                current_field = "question"
            continue
        if low.startswith("кому адресовать"):
            val = t.split(":", 1)[1].strip() if ":" in t else ""
            current["ask_to"] = val
            current_field = "ask_to"
            continue
        if low.startswith("тип ответа"):
            val = t.split(":", 1)[1].strip() if ":" in t else ""
            current["answer_type"] = val
            current_field = "answer_type"
            continue
        if low.startswith("follow-up") or low.startswith("follow up"):
            val = t.split(":", 1)[1].strip() if ":" in t else ""
            current["follow_up"] = val
            current_field = "follow_up"
            continue

        if "?" in t and not current.get("question"):
            current["question"] = t
            current["block"] = current_block
            current_field = "question"
            continue

        if current_field and current.get(current_field):
            current[current_field] = f"{current[current_field]} {t}".strip()

    _push_current()

    if len(out) < min_q:
        fallback: List[Dict[str, str]] = []
        for ln in lines:
            t = re.sub(r"^[\-\*\u2022]+\s*", "", ln).strip()
            if not t or "?" not in t:
                continue
            q = t
            m = re.match(r"^(Q\d+)\s*[:\.\-]\s*(.+)$", q, flags=re.IGNORECASE)
            if m:
                q = m.group(2).strip()
            fallback.append(
                {
                    "id": f"Q{len(fallback) + 1}",
                    "block": "",
                    "question": q,
                    "ask_to": "",
                    "answer_type": "",
                    "follow_up": "",
                }
            )
            if len(fallback) >= max_q:
                break
        if len(fallback) >= min_q:
            return fallback[:max_q]

    return out[:max_q]


def generate_session_title_questions(
    *,
    title: str,
    api_key: str,
    base_url: str,
    prompt_template: str = "",
    min_questions: int = 15,
    max_questions: int = 20,
) -> Dict[str, Any]:
    prompt = _build_session_title_prompt(title, prompt_template=prompt_template)
    messages = [
        {"role": "system", "content": "Ты отвечаешь строго по заданному формату, без вступлений и без лишнего текста."},
        {"role": "user", "content": prompt},
    ]
    raw = _deepseek_chat_text(api_key=api_key, base_url=base_url, messages=messages, timeout=45)
    questions = _parse_session_title_questions(raw, min_questions=min_questions, max_questions=max_questions)
    return {
        "title": str(title or "").strip(),
        "questions": questions,
        "count": len(questions),
        "raw": raw,
    }


def _normalize_path_report_result(obj: Any, *, raw_text: str = "") -> Dict[str, Any]:
    warnings: List[str] = []
    status = "ok"

    if not isinstance(obj, dict):
        warnings.append("invalid_json_object")
        salvaged_md = _extract_report_markdown_from_raw_text(raw_text)
        if salvaged_md:
            warnings.append("report_markdown_salvaged_from_raw")
        return {
            "status": status,
            "report_markdown": salvaged_md or str(raw_text or "").strip(),
            "report_json": {},
            "raw_json": {},
            "recommendations": [],
            "missing_data": [],
            "risks": [],
            "warnings": warnings,
        }

    report_markdown = str(obj.get("report_markdown") or "").strip()
    recommendations_raw = obj.get("recommendations")
    missing_data_raw = obj.get("missing_data")
    risks_raw = obj.get("risks")

    recommendations: List[Dict[str, Any]] = []
    if isinstance(recommendations_raw, list):
        for item in recommendations_raw:
            if not isinstance(item, dict):
                continue
            scope = str(item.get("scope") or "").strip().lower()
            if scope not in {"global", "step"}:
                continue
            text = str(item.get("text") or "").strip()
            expected_effect = str(item.get("expected_effect") or "").strip()
            if not text:
                continue
            row: Dict[str, Any] = {
                "scope": scope,
                "text": text,
                "expected_effect": expected_effect,
            }
            if scope == "step":
                try:
                    order_index = int(item.get("order_index"))
                    if order_index > 0:
                        row["order_index"] = order_index
                except Exception:
                    warnings.append("step_recommendation_missing_order_index")
            recommendations.append(row)
    elif recommendations_raw is not None:
        warnings.append("recommendations_not_array")

    missing_data: List[Dict[str, Any]] = []
    if isinstance(missing_data_raw, list):
        for item in missing_data_raw:
            if not isinstance(item, dict):
                continue
            row: Dict[str, Any] = {}
            try:
                order_index = int(item.get("order_index"))
                if order_index > 0:
                    row["order_index"] = order_index
            except Exception:
                pass
            miss = item.get("missing")
            if isinstance(miss, list):
                row["missing"] = [str(x).strip() for x in miss if str(x).strip()]
            else:
                row["missing"] = []
            missing_data.append(row)
    elif missing_data_raw is not None:
        warnings.append("missing_data_not_array")

    risks: List[Dict[str, Any]] = []
    if isinstance(risks_raw, list):
        for item in risks_raw:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            indexes: List[int] = []
            for raw_idx in (item.get("step_order_indexes") or []):
                try:
                    i = int(raw_idx)
                    if i > 0:
                        indexes.append(i)
                except Exception:
                    continue
            risks.append(
                {
                    "text": text,
                    "step_order_indexes": indexes,
                }
            )
    elif risks_raw is not None:
        warnings.append("risks_not_array")

    if not report_markdown:
        report_markdown = str(raw_text or "").strip()
        warnings.append("missing_report_markdown")

    return {
        "status": status,
        "report_markdown": report_markdown,
        "report_json": {},
        "raw_json": obj if isinstance(obj, dict) else {},
        "recommendations": recommendations,
        "missing_data": missing_data,
        "risks": risks,
        "warnings": warnings,
    }


def _to_non_negative_int(value: Any) -> Optional[int]:
    try:
        n = int(float(value))
    except Exception:
        return None
    if n < 0:
        return None
    return n


def _to_percent_or_none(value: Any) -> Optional[float]:
    try:
        n = float(value)
    except Exception:
        return None
    if n < 0:
        return None
    return round(n, 3)


def _normalize_path_report_result_v2(obj: Any, *, raw_text: str = "", payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    warnings: List[str] = []
    payload = payload if isinstance(payload, dict) else {}
    totals = payload.get("totals") if isinstance(payload.get("totals"), dict) else {}
    coverage_src = payload.get("missing_fields_coverage") if isinstance(payload.get("missing_fields_coverage"), dict) else {}
    status = "ok"

    if not isinstance(obj, dict):
        warnings.append("invalid_json_object")
        salvaged_md = _extract_report_markdown_from_raw_text(raw_text)
        if salvaged_md:
            warnings.append("report_markdown_salvaged_from_raw")
        kpis_fallback = _kpis_fallback_from_payload(payload)
        return {
            "status": status,
            "report_markdown": salvaged_md or str(raw_text or "").strip(),
            "report_json": {
                "title": "",
                "summary": [],
                "kpis": kpis_fallback,
                "bottlenecks": [],
                "recommendations": [],
                "missing_data": [],
            },
            "raw_json": {},
            "recommendations": [],
            "missing_data": [],
            "risks": [],
            "warnings": warnings,
        }

    title = str(obj.get("title") or "").strip()
    summary_raw = obj.get("summary")
    summary: List[str] = []
    if isinstance(summary_raw, list):
        for item in summary_raw:
            text = str(item or "").strip()
            if text:
                summary.append(text)
    elif summary_raw is not None:
        warnings.append("summary_not_array")

    kpis_raw = obj.get("kpis") if isinstance(obj.get("kpis"), dict) else {}
    coverage_raw = kpis_raw.get("coverage") if isinstance(kpis_raw.get("coverage"), dict) else {}
    kpis = {
        "steps_count": _to_non_negative_int(kpis_raw.get("steps_count")),
        "work_total_sec": _to_non_negative_int(kpis_raw.get("work_total_sec")),
        "wait_total_sec": _to_non_negative_int(kpis_raw.get("wait_total_sec")),
        "total_sec": _to_non_negative_int(kpis_raw.get("total_sec")),
        "coverage": {
            "missing_work_duration_pct": _to_percent_or_none(coverage_raw.get("missing_work_duration_pct")),
            "missing_wait_duration_pct": _to_percent_or_none(coverage_raw.get("missing_wait_duration_pct")),
            "missing_notes_pct": _to_percent_or_none(coverage_raw.get("missing_notes_pct")),
        },
    }
    if kpis["steps_count"] is None:
        kpis["steps_count"] = _to_non_negative_int(totals.get("steps_count"))
    if kpis["work_total_sec"] is None:
        kpis["work_total_sec"] = _to_non_negative_int(totals.get("work_total_sec"))
    if kpis["wait_total_sec"] is None:
        kpis["wait_total_sec"] = _to_non_negative_int(totals.get("wait_total_sec"))
    if kpis["total_sec"] is None:
        kpis["total_sec"] = _to_non_negative_int(totals.get("total_sec"))
    for key in ("missing_work_duration_pct", "missing_wait_duration_pct", "missing_notes_pct"):
        if kpis["coverage"][key] is None:
            kpis["coverage"][key] = _to_percent_or_none(coverage_src.get(key))

    bottlenecks: List[Dict[str, Any]] = []
    bottlenecks_raw = obj.get("bottlenecks")
    if isinstance(bottlenecks_raw, list):
        for item in bottlenecks_raw[:5]:
            if isinstance(item, dict):
                row = {
                    "order_index": _to_non_negative_int(item.get("order_index")),
                    "title": str(item.get("title") or "").strip(),
                    "reason": str(item.get("reason") or "").strip(),
                    "impact": str(item.get("impact") or "").strip(),
                }
            else:
                row = {
                    "order_index": None,
                    "title": str(item or "").strip(),
                    "reason": "",
                    "impact": "",
                }
            if row["title"] or row["reason"] or row["impact"]:
                bottlenecks.append(row)
    elif bottlenecks_raw is not None:
        warnings.append("bottlenecks_not_array")

    recommendations: List[Dict[str, Any]] = []
    recommendations_raw = obj.get("recommendations")
    if isinstance(recommendations_raw, list):
        for item in recommendations_raw:
            if not isinstance(item, dict):
                continue
            scope = str(item.get("scope") or "").strip().lower()
            if scope not in {"global", "step"}:
                continue
            priority = str(item.get("priority") or "P1").strip().upper()
            if priority not in {"P0", "P1", "P2"}:
                priority = "P1"
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            row: Dict[str, Any] = {
                "scope": scope,
                "priority": priority,
                "text": text,
                "expected_effect": str(item.get("effect") or item.get("expected_effect") or "").strip(),
                "effect": str(item.get("effect") or item.get("expected_effect") or "").strip(),
                "effort": str(item.get("effort") or "").strip(),
            }
            if scope == "step":
                order_index = _to_non_negative_int(item.get("order_index"))
                if order_index and order_index > 0:
                    row["order_index"] = int(order_index)
                else:
                    warnings.append("step_recommendation_missing_order_index")
            recommendations.append(row)
    elif recommendations_raw is not None:
        warnings.append("recommendations_not_array")

    missing_data: List[Dict[str, Any]] = []
    missing_data_raw = obj.get("missing_data")
    if isinstance(missing_data_raw, list):
        for item in missing_data_raw:
            if not isinstance(item, dict):
                continue
            row: Dict[str, Any] = {}
            order_index = _to_non_negative_int(item.get("order_index"))
            if order_index and order_index > 0:
                row["order_index"] = int(order_index)
            miss = item.get("missing")
            if isinstance(miss, list):
                row["missing"] = [str(x).strip() for x in miss if str(x).strip()]
            else:
                row["missing"] = []
            if row["missing"] or ("order_index" in row):
                missing_data.append(row)
    elif missing_data_raw is not None:
        warnings.append("missing_data_not_array")

    risks: List[Dict[str, Any]] = []
    risks_raw = obj.get("risks")
    if isinstance(risks_raw, list):
        for item in risks_raw:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            indexes: List[int] = []
            for raw_idx in (item.get("step_order_indexes") or []):
                idx = _to_non_negative_int(raw_idx)
                if idx and idx > 0:
                    indexes.append(idx)
            risks.append({"text": text, "step_order_indexes": indexes})
    elif risks_raw is not None:
        warnings.append("risks_not_array")

    report_json = {
        "title": title,
        "summary": summary,
        "kpis": kpis,
        "bottlenecks": bottlenecks,
        "recommendations": recommendations,
        "missing_data": missing_data,
    }

    report_markdown = str(obj.get("report_markdown") or "").strip()
    if not report_markdown:
        lines: List[str] = []
        if title:
            lines.append(f"## {title}")
            lines.append("")
        if summary:
            lines.append("### Summary")
            lines.extend([f"- {s}" for s in summary])
            lines.append("")
        lines.append("### KPIs")
        lines.append(f"- steps_count: {kpis.get('steps_count') if kpis.get('steps_count') is not None else '—'}")
        lines.append(f"- work_total_sec: {kpis.get('work_total_sec') if kpis.get('work_total_sec') is not None else '—'}")
        lines.append(f"- wait_total_sec: {kpis.get('wait_total_sec') if kpis.get('wait_total_sec') is not None else '—'}")
        lines.append(f"- total_sec: {kpis.get('total_sec') if kpis.get('total_sec') is not None else '—'}")
        report_markdown = "\n".join(lines).strip()
        warnings.append("report_markdown_generated_from_json")

    return {
        "status": status,
        "report_markdown": report_markdown,
        "report_json": report_json,
        "raw_json": obj,
        "recommendations": recommendations,
        "missing_data": missing_data,
        "risks": risks,
        "warnings": warnings,
    }


def generate_path_report(
    *,
    payload: Dict[str, Any],
    api_key: str,
    base_url: str,
    prompt_template_version: str = "v2",
    system_prompt: str = "",
) -> Dict[str, Any]:
    version = str(prompt_template_version or "v2").strip().lower() or "v2"
    warnings: List[str] = []
    if version not in {"v1", "v2"}:
        warnings.append("unsupported_prompt_template_version_fallback_v2")
        version = "v2"

    selected_system_prompt = str(system_prompt or "").strip() or (
        _PATH_REPORT_PROMPT_TEMPLATE_V2 if version == "v2" else _PATH_REPORT_PROMPT_TEMPLATE_V1
    )
    user_payload = payload if isinstance(payload, dict) else {}
    messages = [
        {"role": "system", "content": selected_system_prompt},
        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
    ]

    _report_debug_log(
        "DEEPSEEK",
        event="call_start",
        prompt_template_version=version,
        steps=len(user_payload.get("steps") or []) if isinstance(user_payload.get("steps"), list) else 0,
    )
    try:
        raw = _deepseek_chat_text(
            api_key=api_key,
            base_url=base_url,
            messages=messages,
            timeout=90,
            max_tokens=1800,
        )
    except Exception as exc:
        _report_debug_log(
            "DEEPSEEK",
            event="call_end",
            status="error",
            error=str(exc),
        )
        raise
    _report_debug_log(
        "DEEPSEEK",
        event="call_end",
        status="ok",
        raw_len=len(str(raw or "")),
    )
    parsed: Any = None
    candidate = _extract_json_candidate(raw)
    if candidate:
        try:
            parsed = json.loads(candidate)
        except Exception:
            warnings.append("json_parse_failed")
    else:
        warnings.append("json_candidate_not_found")

    if version == "v2":
        normalized = _normalize_path_report_result_v2(parsed, raw_text=raw, payload=user_payload)
    else:
        normalized = _normalize_path_report_result(parsed, raw_text=raw)
    payload_norm_result = normalize_deepseek_report_payload(parsed, payload=user_payload, raw_text=raw)
    payload_normalized = payload_norm_result.get("payload_normalized") or {}
    payload_raw = payload_norm_result.get("payload_raw")
    normalized_raw_text = str(payload_norm_result.get("raw_text") or "").strip()
    norm_warnings = list(payload_norm_result.get("warnings") or [])
    _report_debug_log(
        "REPORT_NORMALIZE",
        status="fallback" if norm_warnings else "ok",
        reason=",".join(norm_warnings) if norm_warnings else "structured",
        title=str(payload_normalized.get("title") or ""),
        summary_count=len(payload_normalized.get("summary") or []) if isinstance(payload_normalized.get("summary"), list) else 0,
    )

    report_markdown = str(normalized.get("report_markdown") or "").strip()
    if not report_markdown or _looks_like_raw_json_blob(report_markdown):
        report_markdown = _build_report_markdown_from_payload_v2(payload_normalized)
        warnings.append("report_markdown_generated_from_normalized")

    merged_warnings_raw = [
        *warnings,
        *list(normalized.get("warnings") or []),
        *list(payload_norm_result.get("warnings") or []),
    ]
    merged_warnings: List[str] = []
    seen_warnings: Set[str] = set()
    for item in merged_warnings_raw:
        code = str(item or "").strip()
        if not code or code in seen_warnings:
            continue
        seen_warnings.add(code)
        merged_warnings.append(code)
    status = str(normalized.get("status") or "ok")

    return {
        "status": status,
        "model": "deepseek-chat",
        "prompt_template_version": version,
        "report_markdown": report_markdown,
        "payload_normalized": payload_normalized,
        "payload_raw": payload_raw if payload_raw is not None else {},
        "report_json": payload_normalized,
        "raw_json": payload_raw if isinstance(payload_raw, dict) else (parsed if isinstance(parsed, dict) else {}),
        "recommendations": payload_normalized.get("recommendations") or normalized.get("recommendations") or [],
        "missing_data": payload_normalized.get("missing_data") or normalized.get("missing_data") or [],
        "risks": payload_normalized.get("risks") or normalized.get("risks") or [],
        "warnings": merged_warnings,
        "raw_text": normalized_raw_text or str(raw or ""),
    }


def _node_brief(n: Node) -> Dict[str, Any]:
    return {
        "id": n.id,
        "type": n.type,
        "title": n.title,
        "actor_role": n.actor_role,
        "recipient_role": n.recipient_role,
        "equipment": list(n.equipment or []),
        "duration_min": n.duration_min,
        "disposition": n.disposition or {},
        "parameters": n.parameters or {},
    }


def _extract_process_name_from_bpmn_xml(bpmn_xml: str) -> str:
    xml = (bpmn_xml or "").strip()
    if not xml:
        return ""
    try:
        root = ET.fromstring(xml)
    except Exception:
        return ""
    for el in root.iter():
        if _local_name(str(getattr(el, "tag", "") or "")) != "process":
            continue
        name = str(el.attrib.get("name") or "").strip()
        if name:
            return name
    return ""


def _session_context(s: Session) -> Dict[str, str]:
    session_title = str(getattr(s, "title", "") or "").strip()
    process_name = _extract_process_name_from_bpmn_xml(str(getattr(s, "bpmn_xml", "") or ""))
    if not process_name:
        process_name = session_title
    return {
        "session_title": session_title,
        "process_name": process_name,
    }


def _safe_text(v: Any, limit: int = 240) -> str:
    t = str(v or "").strip()
    if len(t) <= limit:
        return t
    return t[: max(limit - 1, 0)].rstrip() + "…"


def _session_graph_context(s: Session) -> Dict[str, Any]:
    by_type: Dict[str, int] = {}
    by_role: Dict[str, int] = {}
    for n in (s.nodes or []):
        t = str(getattr(n, "type", "") or "step").strip() or "step"
        by_type[t] = by_type.get(t, 0) + 1
        role = _safe_text(getattr(n, "actor_role", "") or "unassigned", 80) or "unassigned"
        by_role[role] = by_role.get(role, 0) + 1
    return {
        "nodes_total": len(s.nodes or []),
        "edges_total": len(s.edges or []),
        "by_type": by_type,
        "by_role": by_role,
    }


def _session_interview_context(s: Session, max_steps: int = 80) -> Dict[str, Any]:
    interview = getattr(s, "interview", None)
    iv = interview if isinstance(interview, dict) else {}
    boundaries_raw = iv.get("boundaries")
    boundaries_src = boundaries_raw if isinstance(boundaries_raw, dict) else {}
    boundary_fields = (
        "trigger",
        "start_shop",
        "intermediate_roles",
        "input_physical",
        "finish_state",
        "finish_shop",
        "output_physical",
    )
    boundaries = {k: _safe_text(boundaries_src.get(k), 180) for k in boundary_fields}
    steps_raw = iv.get("steps")
    steps_src = steps_raw if isinstance(steps_raw, list) else []
    step_items: List[Dict[str, Any]] = []
    for idx, st in enumerate(steps_src):
        if len(step_items) >= max_steps:
            break
        if not isinstance(st, dict):
            continue
        step_items.append(
            {
                "seq": idx + 1,
                "id": _safe_text(st.get("id"), 80),
                "node_id": _safe_text(st.get("node_id"), 80),
                "type": _safe_text(st.get("type"), 60),
                "action": _safe_text(st.get("action"), 220),
                "role": _safe_text(st.get("role"), 120),
                "area": _safe_text(st.get("area"), 120),
                "subprocess": _safe_text(st.get("subprocess"), 120),
                "duration_min": _safe_text(st.get("duration_min"), 40),
                "wait_min": _safe_text(st.get("wait_min"), 40),
                "output": _safe_text(st.get("output"), 160),
                "comment": _safe_text(st.get("comment"), 220),
            }
        )
    exceptions_raw = iv.get("exceptions")
    exceptions = exceptions_raw if isinstance(exceptions_raw, list) else []
    return {
        "boundaries": boundaries,
        "steps_total": len(steps_src),
        "steps_sample": step_items,
        "exceptions_total": len(exceptions),
    }


def _node_neighborhood_context(s: Session, node_id: str, max_items: int = 8) -> Dict[str, Any]:
    nid = (node_id or "").strip()
    nodes_by_id = {str(getattr(n, "id", "") or "").strip(): n for n in (s.nodes or [])}
    incoming_ids: List[str] = []
    outgoing_ids: List[str] = []
    for e in (s.edges or []):
        src = str(getattr(e, "from_id", "") or "").strip()
        dst = str(getattr(e, "to_id", "") or "").strip()
        if dst == nid and src:
            incoming_ids.append(src)
        if src == nid and dst:
            outgoing_ids.append(dst)

    def _brief_neighbor(xid: str) -> Dict[str, Any]:
        n = nodes_by_id.get(xid)
        if not n:
            return {"id": xid, "title": "", "type": "", "role": ""}
        return {
            "id": xid,
            "title": _safe_text(getattr(n, "title", ""), 180),
            "type": _safe_text(getattr(n, "type", ""), 60),
            "role": _safe_text(getattr(n, "actor_role", ""), 120),
        }

    incoming = [_brief_neighbor(x) for x in incoming_ids[:max_items]]
    outgoing = [_brief_neighbor(x) for x in outgoing_ids[:max_items]]
    return {
        "incoming_count": len(incoming_ids),
        "outgoing_count": len(outgoing_ids),
        "incoming_sample": incoming,
        "outgoing_sample": outgoing,
    }


def _node_interview_steps_context(s: Session, node: Node, max_items: int = 5) -> List[Dict[str, Any]]:
    interview = getattr(s, "interview", None)
    iv = interview if isinstance(interview, dict) else {}
    steps_raw = iv.get("steps")
    steps_src = steps_raw if isinstance(steps_raw, list) else []
    node_id = str(getattr(node, "id", "") or "").strip()
    node_title_norm = str(getattr(node, "title", "") or "").strip().lower()
    out: List[Dict[str, Any]] = []
    for idx, st in enumerate(steps_src):
        if len(out) >= max_items:
            break
        if not isinstance(st, dict):
            continue
        sid = str(st.get("node_id") or "").strip()
        act = str(st.get("action") or "").strip()
        act_norm = act.lower()
        if not ((sid and sid == node_id) or (node_title_norm and act_norm and act_norm == node_title_norm)):
            continue
        out.append(
            {
                "seq": idx + 1,
                "id": _safe_text(st.get("id"), 80),
                "action": _safe_text(st.get("action"), 220),
                "role": _safe_text(st.get("role"), 120),
                "area": _safe_text(st.get("area"), 120),
                "type": _safe_text(st.get("type"), 60),
                "duration_min": _safe_text(st.get("duration_min"), 40),
                "wait_min": _safe_text(st.get("wait_min"), 40),
                "comment": _safe_text(st.get("comment"), 220),
            }
        )
    return out


def _node_stage_context(s: Session, node: Node) -> Dict[str, Any]:
    interview = getattr(s, "interview", None)
    iv = interview if isinstance(interview, dict) else {}
    steps_raw = iv.get("steps")
    steps_src = steps_raw if isinstance(steps_raw, list) else []
    node_id = str(getattr(node, "id", "") or "").strip()
    node_title_norm = str(getattr(node, "title", "") or "").strip().lower()

    def _matches_step(step_obj: Dict[str, Any]) -> bool:
        sid = str(step_obj.get("node_id") or step_obj.get("nodeId") or "").strip()
        action = str(step_obj.get("action") or step_obj.get("title") or "").strip()
        action_norm = action.lower()
        if sid and sid == node_id:
            return True
        if node_title_norm and action_norm and action_norm == node_title_norm:
            return True
        return False

    def _step_brief(step_obj: Any, seq: int) -> Dict[str, Any]:
        if not isinstance(step_obj, dict):
            return {}
        return {
            "seq": int(seq),
            "step_id": _safe_text(step_obj.get("id"), 80),
            "node_id": _safe_text(step_obj.get("node_id") or step_obj.get("nodeId"), 80),
            "action": _safe_text(step_obj.get("action") or step_obj.get("title"), 220),
            "role": _safe_text(step_obj.get("role"), 120),
            "type": _safe_text(step_obj.get("type"), 60),
            "duration_min": _safe_text(step_obj.get("duration_min"), 40),
            "wait_min": _safe_text(step_obj.get("wait_min"), 40),
        }

    match_indexes: List[int] = []
    for idx, step in enumerate(steps_src):
        if not isinstance(step, dict):
            continue
        if _matches_step(step):
            match_indexes.append(idx)

    if not match_indexes:
        return {
            "steps_total": len(steps_src),
            "matched_count": 0,
            "position_seq": None,
            "previous_step": {},
            "current_step": {},
            "next_step": {},
        }

    focus_idx = match_indexes[0]
    prev_idx = focus_idx - 1
    next_idx = focus_idx + 1
    prev_step = _step_brief(steps_src[prev_idx], prev_idx + 1) if prev_idx >= 0 else {}
    curr_step = _step_brief(steps_src[focus_idx], focus_idx + 1)
    next_step = _step_brief(steps_src[next_idx], next_idx + 1) if next_idx < len(steps_src) else {}

    return {
        "steps_total": len(steps_src),
        "matched_count": len(match_indexes),
        "position_seq": focus_idx + 1,
        "previous_step": prev_step,
        "current_step": curr_step,
        "next_step": next_step,
    }


def _existing_question_texts(s: Session) -> Set[str]:
    seen: Set[str] = set()
    for q in (s.questions or []):
        qt = (q.question or "").strip().lower()
        if qt:
            seen.add(qt)
    return seen


def _extract_start_event_name_and_lanes(bpmn_xml: str) -> Dict[str, Any]:
    xml = (bpmn_xml or "").strip()
    if not xml:
        return {"start_event_name": "", "lanes": []}
    try:
        root = ET.fromstring(xml)
    except Exception:
        return {"start_event_name": "", "lanes": []}

    start_name = ""
    lanes: List[str] = []
    seen: Set[str] = set()
    for el in root.iter():
        name = _local_name(str(getattr(el, "tag", "") or ""))
        if name == "startevent" and not start_name:
            start_name = str(el.attrib.get("name") or "").strip()
        if name == "lane":
            lane_name = str(el.attrib.get("name") or "").strip()
            if lane_name and lane_name not in seen:
                seen.add(lane_name)
                lanes.append(lane_name)
    return {"start_event_name": start_name, "lanes": lanes}


def _build_parsed_bpmn_json(s: Session, focus_node_id: str = "") -> Dict[str, Any]:
    focus = (focus_node_id or "").strip()
    focus_mode = bool(focus)
    nodes_by_id = {
        str(getattr(n, "id", "") or "").strip(): n
        for n in (s.nodes or [])
        if str(getattr(n, "id", "") or "").strip()
    }
    if focus_mode and focus and focus not in nodes_by_id:
        focus_mode = False

    related_node_ids: Set[str] = set()
    if focus_mode and focus:
        related_node_ids.add(focus)
        for e in (s.edges or []):
            src = str(getattr(e, "from_id", "") or "").strip()
            dst = str(getattr(e, "to_id", "") or "").strip()
            if src == focus and dst:
                related_node_ids.add(dst)
            if dst == focus and src:
                related_node_ids.add(src)

    nodes_payload: List[Dict[str, Any]] = []
    for n in (s.nodes or []):
        nid = str(getattr(n, "id", "") or "").strip()
        if not nid:
            continue
        if focus_mode and nid not in related_node_ids:
            continue
        nodes_payload.append(
            {
                "id": nid,
                "name": str(getattr(n, "title", "") or "").strip(),
                "type": str(getattr(n, "type", "") or "").strip(),
                "actor_role": str(getattr(n, "actor_role", "") or "").strip(),
                "recipient_role": str(getattr(n, "recipient_role", "") or "").strip(),
            }
        )

    edges_payload: List[Dict[str, Any]] = []
    for e in (s.edges or []):
        src = str(getattr(e, "from_id", "") or "").strip()
        dst = str(getattr(e, "to_id", "") or "").strip()
        if not src or not dst:
            continue
        if focus_mode and src not in related_node_ids and dst not in related_node_ids:
            continue
        edges_payload.append(
            {
                "from_id": src,
                "to_id": dst,
                "when": str(getattr(e, "when", "") or "").strip(),
            }
        )

    ctx = _session_context(s)
    bpmn_ctx = _extract_start_event_name_and_lanes(str(getattr(s, "bpmn_xml", "") or ""))
    lanes = [x for x in (bpmn_ctx.get("lanes") or []) if str(x or "").strip()]
    if not lanes:
        lanes = [str(x or "").strip() for x in (s.roles or []) if str(x or "").strip()]
    return {
        "process_name": ctx.get("process_name") or ctx.get("session_title") or "",
        "start_event_name": str(bpmn_ctx.get("start_event_name") or "").strip(),
        "lanes": lanes,
        "nodes": nodes_payload,
        "edges": edges_payload,
    }


def _build_memory_payload(s: Session, node_id: str = "", max_items: int = 300) -> Dict[str, Any]:
    nid = (node_id or "").strip()
    already_asked: List[str] = []
    answers: Dict[str, str] = {}
    seen_q: Set[str] = set()
    for q in (s.questions or []):
        qtext = str(getattr(q, "question", "") or "").strip()
        if not qtext:
            continue
        if nid and str(getattr(q, "node_id", "") or "").strip() != nid:
            continue
        low = qtext.lower()
        if low in seen_q:
            continue
        seen_q.add(low)
        already_asked.append(qtext)
        if len(already_asked) >= max_items:
            break

    for q in (s.questions or []):
        qid = str(getattr(q, "id", "") or "").strip()
        ans = str(getattr(q, "answer", "") or "").strip()
        if not qid or not ans:
            continue
        if nid and str(getattr(q, "node_id", "") or "").strip() != nid:
            continue
        answers[qid] = ans[:500]
        if len(answers) >= max_items:
            break

    return {
        "already_asked": already_asked[:max_items],
        "answers": answers,
    }


def _target_from_patch_hint(patch_hint: Dict[str, Any], expected_format: str = "") -> Optional[Dict[str, Any]]:
    if not isinstance(patch_hint, dict):
        return None
    raw_field = str(patch_hint.get("field") or "").strip()
    if not raw_field:
        return None
    f_low = raw_field.lower()
    field_map = {
        "timeduration": "duration_min",
        "criterion": "parameters.done_criteria",
        "inputs": "parameters.inputs",
        "outputs": "parameters.outputs",
        "equipment": "equipment",
        "actor": "actor_role",
        "done_criteria": "parameters.done_criteria",
        "qc_check": "parameters.qc_check",
        "record": "parameters.record",
        "handoff_to": "recipient_role",
        "zeebe_property": "parameters.zeebe_property",
    }
    mapped_field = field_map.get(f_low) or f"parameters.{raw_field}"

    value_type = str(patch_hint.get("value_type") or "").strip().lower()
    fmt = str(expected_format or "").strip().lower()
    transform = "text"
    if mapped_field == "duration_min" or f_low == "timeduration":
        transform = "minutes"
    elif value_type == "enum":
        transform = "text"
    elif fmt == "number_with_unit" and mapped_field == "duration_min":
        transform = "minutes"

    return {
        "field": mapped_field,
        "mode": "set",
        "transform": transform,
    }


def _normalize_questions_from_llm(
    obj: Any,
    *,
    node_ids: Set[str],
    limit: int,
    existing_texts: Set[str],
    default_node_id: str = "",
) -> List[Question]:
    items: List[Dict[str, Any]] = []
    if isinstance(obj, dict):
        if isinstance(obj.get("questions"), list):
            items = [x for x in obj.get("questions") if isinstance(x, dict)]
        elif isinstance(obj.get("result"), dict) and isinstance(obj.get("result", {}).get("questions"), list):
            items = [x for x in obj.get("result", {}).get("questions") if isinstance(x, dict)]
    elif isinstance(obj, list):
        items = [x for x in obj if isinstance(x, dict)]

    out: List[Question] = []
    used_texts: Set[str] = set(existing_texts or set())
    default_node = (default_node_id or "").strip()

    for it in items:
        if len(out) >= limit:
            break
        qtext = str(it.get("question") or "").strip()
        if not qtext:
            continue
        low = qtext.lower()
        if low in used_texts:
            continue

        node_id = str(it.get("node_id") or "").strip() or default_node
        if not node_id:
            continue
        if node_ids and node_id not in node_ids:
            continue

        issue_type = str(it.get("issue_type") or "").strip().upper()
        if issue_type not in _ALLOWED_ISSUE:
            pr = int(it.get("priority") or 0) if str(it.get("priority") or "").strip().isdigit() else 0
            issue_type = "CRITICAL" if pr == 1 else "MISSING"

        expected_format = str(it.get("expected_answer_format") or "").strip().lower()
        choices = it.get("choices")
        use_choices = isinstance(choices, list)
        opts = choices if use_choices else it.get("options")
        if not isinstance(opts, list):
            opts = []
        opts = [str(x).strip() for x in opts if str(x).strip()][:20]
        if use_choices and expected_format != "choice":
            opts = opts[:0]

        target = it.get("target")
        if not isinstance(target, dict):
            target = None
        patch_hint = it.get("bpmn_patch_hint")
        mapped_target = _target_from_patch_hint(patch_hint, expected_format)
        if mapped_target:
            target = mapped_target

        qid = str(it.get("question_id") or "").strip()
        if not qid:
            field = str((target or {}).get("field") or "")
            qid = _stable_qid(node_id, field, qtext)
        elif not qid.startswith("llm_"):
            qid = f"llm_{_sha12(qid + '|' + node_id + '|' + qtext)}"

        out.append(
            Question(
                id=qid,
                node_id=node_id,
                issue_type=issue_type,  # type: ignore[arg-type]
                question=qtext,
                options=opts,
                target=target,
            )
        )
        used_texts.add(low)

    return out[:limit]


def generate_llm_questions(
    s: Session,
    api_key: str,
    base_url: str,
    limit: int = 10,
    mode: str = "strict",
    system_prompt: str = "",
) -> List[Question]:
    lim = int(limit or 0)
    if lim <= 0:
        lim = 10
    lim = min(max(lim, 1), 10)

    mode = (mode or "strict").strip().lower()
    if mode not in ("strict", "soft"):
        mode = "strict"

    existing_texts = _existing_question_texts(s)
    node_ids = {
        str(getattr(n, "id", "") or "").strip()
        for n in (s.nodes or [])
        if str(getattr(n, "id", "") or "").strip()
    }

    bpmn_xml = str(getattr(s, "bpmn_xml", "") or "").strip()
    user: Dict[str, Any] = {
        "memory": _build_memory_payload(s, max_items=300),
        "constraints": {"max_questions": lim},
    }
    if bpmn_xml:
        user["bpmn_xml"] = bpmn_xml[:22000]
    else:
        user["parsed_bpmn_json"] = _build_parsed_bpmn_json(s)

    system = str(system_prompt or "").strip() or _LLM_QUESTION_POLICY_PROMPT
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]
    obj = _deepseek_chat_json(
        api_key=api_key,
        base_url=base_url,
        messages=messages,
        timeout=_LLM_QUESTIONS_TIMEOUT_SEC,
    )
    return _normalize_questions_from_llm(
        obj,
        node_ids=node_ids,
        limit=lim,
        existing_texts=existing_texts,
    )


def _node_existing_llm_texts(s: Session, node_id: str) -> Set[str]:
    out: Set[str] = set()
    nid = (node_id or "").strip()
    if not nid:
        return out
    for q in (s.questions or []):
        qid = str(getattr(q, "id", "") or "")
        if not qid.startswith("llm_"):
            continue
        if str(getattr(q, "node_id", "") or "") != nid:
            continue
        qt = str(getattr(q, "question", "") or "").strip().lower()
        if qt:
            out.add(qt)
    return out


def _local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[1].lower()
    if ":" in tag:
        return tag.rsplit(":", 1)[1].lower()
    return tag.lower()


def collect_node_ids_in_bpmn_order(bpmn_xml: str, known_ids: Set[str]) -> List[str]:
    xml = (bpmn_xml or "").strip()
    if not xml:
        return []
    try:
        root = ET.fromstring(xml)
    except Exception:
        return []

    allowed = {
        "task",
        "usertask",
        "servicetask",
        "manualtask",
        "scripttask",
        "businessruletask",
        "sendtask",
        "receivetask",
        "callactivity",
        "subprocess",
        "exclusivegateway",
        "inclusivegateway",
        "eventbasedgateway",
        "parallelgateway",
        "intermediatecatchevent",
        "intermediatethrowevent",
        "intermediateevent",
    }
    known = {str(x or "").strip() for x in (known_ids or set()) if str(x or "").strip()}
    out: List[str] = []
    seen: Set[str] = set()
    for el in root.iter():
        name = _local_name(el.tag)
        if name not in allowed:
            continue
        eid = str(el.attrib.get("id") or "").strip()
        if not eid or eid in seen:
            continue
        if known and eid not in known:
            continue
        seen.add(eid)
        out.append(eid)
    return out


def extract_node_xml_snippet(bpmn_xml: str, node_id: str) -> str:
    xml = (bpmn_xml or "").strip()
    nid = (node_id or "").strip()
    if not xml or not nid:
        return ""
    try:
        root = ET.fromstring(xml)
    except Exception:
        return ""
    for el in root.iter():
        if str(el.attrib.get("id") or "").strip() != nid:
            continue
        raw = ET.tostring(el, encoding="unicode")
        return (raw or "").strip()[:4000]
    return ""


def generate_llm_questions_for_node(
    s: Session,
    node: Node,
    api_key: str,
    base_url: str,
    limit: int = 5,
    node_xml: str = "",
    system_prompt: str = "",
) -> List[Question]:
    lim = int(limit or 5)
    lim = min(max(lim, 1), 5)

    existing_node = _node_existing_llm_texts(s, node.id)
    node_ids = {
        str(getattr(n, "id", "") or "").strip()
        for n in (s.nodes or [])
        if str(getattr(n, "id", "") or "").strip()
    }

    bpmn_xml = str(getattr(s, "bpmn_xml", "") or "").strip()
    stage_context = _node_stage_context(s, node)
    graph_neighbors = _node_neighborhood_context(s, str(getattr(node, "id", "") or ""), max_items=4)
    interview_hits = _node_interview_steps_context(s, node, max_items=3)
    base_system = str(system_prompt or "").strip() or _LLM_QUESTION_POLICY_PROMPT
    system = (
        base_system
        + "\n\nДополнительное правило для этого запроса:\n"
        + f"- Верни вопросы ТОЛЬКО по node_id=\"{node.id}\".\n"
        + f"- Верни не больше {lim} вопросов.\n"
        + "- Обязательно учитывай контекст этапа из node_focus.stage_context "
        + "(previous_step/current_step/next_step), чтобы вопросы соответствовали месту шага в процессе."
    )
    user: Dict[str, Any] = {
        "memory": _build_memory_payload(s, node_id=node.id, max_items=120),
        "constraints": {"max_questions": lim},
        "node_focus": {
            "node_id": str(getattr(node, "id", "") or ""),
            "node_name": str(getattr(node, "title", "") or ""),
            "node_type": str(getattr(node, "type", "") or ""),
            "actor_role": str(getattr(node, "actor_role", "") or ""),
            "node_xml_element": (node_xml or "")[:4000],
            "stage_context": stage_context,
            "graph_neighbors": graph_neighbors,
            "interview_step_hits": interview_hits,
        },
    }
    if bpmn_xml:
        user["bpmn_xml"] = bpmn_xml[:22000]
    else:
        user["parsed_bpmn_json"] = _build_parsed_bpmn_json(s, focus_node_id=node.id)

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]

    obj = _deepseek_chat_json(
        api_key=api_key,
        base_url=base_url,
        messages=messages,
        timeout=_LLM_QUESTIONS_TIMEOUT_SEC,
    )
    out = _normalize_questions_from_llm(
        obj,
        node_ids=node_ids,
        limit=lim,
        existing_texts=existing_node,
        default_node_id=str(getattr(node, "id", "") or ""),
    )
    filtered = [q for q in out if str(getattr(q, "node_id", "") or "").strip() == str(getattr(node, "id", "") or "").strip()]
    return filtered[:lim]
