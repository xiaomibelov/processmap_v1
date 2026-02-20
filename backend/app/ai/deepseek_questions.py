from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Dict, List, Optional, Set
import xml.etree.ElementTree as ET

import requests

from ..models import Node, Question, Session


_ALLOWED_ISSUE = {"CRITICAL", "MISSING", "VARIANT", "AMBIG", "LOSS"}
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


def _deepseek_chat_json(api_key: str, base_url: str, messages: List[Dict[str, str]], timeout: int = 30) -> Any:
    api_key = (api_key or "").strip()
    if not api_key:
        raise ValueError("no api key")
    base = (base_url or "https://api.deepseek.com").strip().rstrip("/")

    payload = {
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": 0.0,
    }

    url = f"{base}/v1/chat/completions"
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=timeout,
    )
    r.raise_for_status()
    data = r.json()
    content = data["choices"][0]["message"]["content"]

    cand = _extract_json_candidate(content)
    if not cand:
        raise ValueError("no json in response")

    return json.loads(cand)


def _deepseek_chat_text(api_key: str, base_url: str, messages: List[Dict[str, str]], timeout: int = 30) -> str:
    api_key = (api_key or "").strip()
    if not api_key:
        raise ValueError("no api key")
    base = (base_url or "https://api.deepseek.com").strip().rstrip("/")

    payload = {
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": 0.2,
    }

    url = f"{base}/v1/chat/completions"
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=timeout,
    )
    r.raise_for_status()
    data = r.json()
    content = str((((data.get("choices") or [{}])[0] or {}).get("message") or {}).get("content") or "")
    return content.strip()


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

    messages = [
        {"role": "system", "content": _LLM_QUESTION_POLICY_PROMPT},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]
    obj = _deepseek_chat_json(api_key=api_key, base_url=base_url, messages=messages)
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
    system = (
        _LLM_QUESTION_POLICY_PROMPT
        + "\n\nДополнительное правило для этого запроса:\n"
        + f"- Верни вопросы ТОЛЬКО по node_id=\"{node.id}\".\n"
        + f"- Верни не больше {lim} вопросов."
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

    obj = _deepseek_chat_json(api_key=api_key, base_url=base_url, messages=messages)
    out = _normalize_questions_from_llm(
        obj,
        node_ids=node_ids,
        limit=lim,
        existing_texts=existing_node,
        default_node_id=str(getattr(node, "id", "") or ""),
    )
    filtered = [q for q in out if str(getattr(q, "node_id", "") or "").strip() == str(getattr(node, "id", "") or "").strip()]
    return filtered[:lim]
