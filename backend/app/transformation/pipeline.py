"""E35.2/E35.3 — конвейер AI-трансформации AS IS -> TO BE draft.

Три слоя:
1. extract_facts — факты из AS IS BPMN (parse_bpmn + textAnnotation/documentation
   + сырые camunda:properties, включая legacy v0.2 ключи).
2. match — детерминированный мэтчер по библиотеке правил (rules.yaml); для
   неоднозначных/нераспознанных задач — LLM (DeepSeek) с библиотекой правил в
   промпте, строгий JSON, retries=1. LLM недоступен → deterministic-only режим,
   всё нераспознанное уходит в open_question (НИКОГДА не угадываем).
3. build_draft — draft ui_model (узлы с operation_code/params/outputs/координатами
   и derived_from), trace map (каждый элемент AS IS -> судьба), open questions.
   Затем ОБЯЗАТЕЛЬНЫЙ прогон валидатора (семантика bpmn_import: коды из каталога,
   ссылки объявлены -> draft_entities, условия шлюзов из объявленных outputs);
   элементы, не прошедшие валидацию, удаляются/помечаются open_question.

Принцип: LLM предлагает — валидатор отвергает. Вывод LLM без прогона
валидатора никогда не попадает в draft.
"""
from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from typing import Any, Callable, Dict, List, Optional, Tuple

from ..process_template.bpmn_import import (
    BPMN_NS,
    CAMUNDA_NS,
    LEGACY_TASK_TYPES,
    _DOLLAR_RE,
    _local_name,
    parse_bpmn,
)
from ..validation.service import validate_ui_model
from .rules_loader import load_rules, rule_summary

# camunda:property значения-заглушки AS IS — не переносим в draft.
PLACEHOLDER_VALUES = {"-", "required", "required_runtime", "required_future", "scheduler_or_fixed_runtime"}

# camunda:property ключи, извлекающие переменные recipe_context (legacy ${...}).
_RECIPE_CTX_RE = re.compile(r"^\$\{recipe_context\.([A-Za-z_][A-Za-z0-9_]*)\}$")

_TASK_LIKE = {"task"} | LEGACY_TASK_TYPES
_EVENT_TYPES = {"startEvent", "endEvent", "intermediateCatchEvent", "intermediateThrowEvent"}
_GATEWAY_TYPES = {"exclusiveGateway", "parallelGateway", "inclusiveGateway", "eventBasedGateway"}

FATES = {"transformed_to", "pushed_below", "dropped", "open_question"}

# LLM2 — порог confidence для LLM-решений: ниже → open_question, не угадывание.
LLM_CONFIDENCE_THRESHOLD = 0.6
# LLM2 — feature гейтвея и лимит ответа (решение владельца L3: transform 2000).
LLM_FEATURE = "as_is_transform"
LLM_MAX_TOKENS = 2000

LLM_SYSTEM_PROMPT = (
    "Ты — эксперт по трансформации BPMN-процессов кухни AS IS -> TO BE (формат v0.3). "
    "Тебе дан список правил трансформации и список задач AS IS, которые не удалось "
    "сопоставить детерминированно. Для каждой задачи выбери ОДНО правило из списка "
    "или null, если ни одно правило не подходит уверенно. "
    "Ответь СТРОГО одним JSON-объектом без пояснений: "
    '{"matches": [{"element_id": "...", "rule_id": "..." | null, "confidence": 0.0}]}. '
    "Не выдумывай правила и element_id. Не угадывай: если сомневаешься — rule_id=null."
)


# ---------------------------------------------------------------------------
# Layer 1: facts
# ---------------------------------------------------------------------------

def extract_facts(xml_text: str) -> Dict[str, Any]:
    """Слой 1: факты из AS IS BPMN (ui_model + сырые props + аннотации)."""
    result = parse_bpmn(xml_text)
    root = ET.fromstring(xml_text)

    annotations: List[Dict[str, str]] = []
    for ta in root.iter(f"{{{BPMN_NS}}}textAnnotation"):
        text_el = ta.find(f"{{{BPMN_NS}}}text")
        annotations.append({"id": ta.get("id") or "", "text": (text_el.text or "").strip() if text_el is not None else ""})

    # raw per-element camunda props + documentation (parse_bpmn отбрасывает legacy ключи)
    raw_props: Dict[str, Dict[str, str]] = {}
    docs: Dict[str, str] = {}
    lane_of: Dict[str, str] = {}
    processes = root.findall(f"{{{BPMN_NS}}}process")
    process = processes[0] if processes else None
    if process is not None:
        for el in process:
            local = _local_name(str(el.tag))
            element_id = el.get("id") or ""
            if not element_id:
                continue
            doc_el = el.find(f"{{{BPMN_NS}}}documentation")
            if doc_el is not None and (doc_el.text or "").strip():
                docs[element_id] = (doc_el.text or "").strip()
            if local in _TASK_LIKE:
                props: Dict[str, str] = {}
                for ext in el.findall(f"{{{BPMN_NS}}}extensionElements"):
                    for container in ext.findall(f"{{{CAMUNDA_NS}}}properties"):
                        for prop in container.findall(f"{{{CAMUNDA_NS}}}property"):
                            name = prop.get("name") or ""
                            if name:
                                props[name] = prop.get("value") or ""
                raw_props[element_id] = props
        for lane_set in process.findall(f"{{{BPMN_NS}}}laneSet"):
            for lane in lane_set.findall(f"{{{BPMN_NS}}}lane"):
                lane_name = lane.get("name") or ""
                for ref in lane.findall(f"{{{BPMN_NS}}}flowNodeRef"):
                    ref_id = (ref.text or "").strip()
                    if ref_id:
                        lane_of[ref_id] = lane_name

    elements: List[Dict[str, Any]] = []
    for node in result.ui_model["nodes"]:
        element_id = node["id"]
        elements.append(
            {
                "id": element_id,
                "bpmn_type": node["bpmn_type"],
                "name": node.get("name") or "",
                "documentation": docs.get(element_id, ""),
                "camunda_props": raw_props.get(element_id, {}),
                "lane": lane_of.get(element_id, ""),
                "x": node.get("x", 0.0),
                "y": node.get("y", 0.0),
                "width": node.get("width", 0.0),
                "height": node.get("height", 0.0),
            }
        )

    return {
        "elements": elements,
        "annotations": annotations,
        "ui_model": result.ui_model,
        "import_report": result.report,
        "import_draft_entities": result.draft_entities,
    }


# ---------------------------------------------------------------------------
# Layer 2: rule matching (deterministic + LLM fallback)
# ---------------------------------------------------------------------------

def _value_match(allowed: str, value: str) -> bool:
    allowed = str(allowed)
    if allowed == "*":
        return True
    if allowed.endswith("*"):
        return value.startswith(allowed[:-1])
    return value == allowed


def _rule_score(rule: Dict[str, Any], fact: Dict[str, Any]) -> Optional[int]:
    pattern = rule.get("as_is_pattern") or {}
    task_types = pattern.get("task_types")
    if task_types and fact["bpmn_type"] not in task_types:
        return None
    props = pattern.get("camunda_props") or {}
    keywords = pattern.get("name_keywords") or []
    prop_hit = False
    if props:
        props_ok = True
        for key, allowed_values in props.items():
            value = fact["camunda_props"].get(key)
            if value is None or not any(_value_match(a, value) for a in (allowed_values or ["*"])):
                props_ok = False
                break
        prop_hit = props_ok
    kw_hit = False
    if keywords:
        text = f"{fact.get('name') or ''} {fact.get('documentation') or ''}"
        kw_hit = any(re.search(kw, text, re.IGNORECASE) for kw in keywords)
    # camunda_props и name_keywords — семантика ИЛИ; совпадение props сильнее (+1000)
    if not (prop_hit or kw_hit):
        return None
    return int(rule.get("priority") or 0) + (1000 if prop_hit else 0)


def match_deterministic_winners(fact: Dict[str, Any], rules: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Все правила с максимальным score. >1 победителя = tie (неоднозначность)."""
    best_score: Optional[int] = None
    winners: List[Dict[str, Any]] = []
    for rule in rules:
        score = _rule_score(rule, fact)
        if score is None:
            continue
        if best_score is None or score > best_score:
            best_score = score
            winners = [rule]
        elif score == best_score:
            winners.append(rule)
    return winners


def match_deterministic(fact: Dict[str, Any], rules: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    # Поведение для прямых вызовов сохранено: первый из победителей (rules отсортированы по -priority).
    winners = match_deterministic_winners(fact, rules)
    return winners[0] if winners else None


def _default_llm_call(system_prompt: str, user_prompt: str) -> str:
    """LLM2 — вызов через LLM-гейтвей (feature=as_is_transform). Raises on failure
    (upstream превращает в llm_status="offline" + open_questions, как раньше).

    Контракт caller(system, user) -> raw string сохранён; mock-фолбэк НЕ удалён —
    caller подменяется параметром llm_call (тесты, оффлайн-прогоны).
    Промт (system) — из llm_prompts(feature=as_is_transform, active), сид v1 —
    миграция 014; текст совпадает с LLM_SYSTEM_PROMPT.
    """
    from ..ai.gateway import complete

    try:
        payload = json.loads(user_prompt)
    except Exception:
        payload = {"input": user_prompt}
    result = complete(LLM_FEATURE, payload, max_tokens=LLM_MAX_TOKENS)
    if not result.get("ok"):
        raise RuntimeError(f"llm gateway {result.get('status')}: {result.get('error')}")
    return str(result.get("text") or "")


def match_with_llm(
    facts: List[Dict[str, Any]],
    rules: List[Dict[str, Any]],
    llm_call: Optional[Callable[[str, str], str]] = None,
) -> Tuple[Dict[str, str], str]:
    """LLM-мэтчинг нераспознанных задач. Возвращает ({element_id: rule_id}, status).

    status: "llm" | "offline" | "disabled". Любой сбой → offline, без исключений.
    Строгая валидация: неизвестные rule_id/element_id отбрасываются.
    """
    if not facts:
        return {}, "disabled"
    caller = llm_call or _default_llm_call
    known_rules = {r["id"] for r in rules}
    requested_ids = {f["id"] for f in facts}
    user_prompt = json.dumps(
        {
            "rules": [rule_summary(r) for r in rules],
            "unmatched_tasks": [
                {
                    "element_id": f["id"],
                    "bpmn_type": f["bpmn_type"],
                    "name": f.get("name") or "",
                    "documentation": f.get("documentation") or "",
                    "camunda_props": f.get("camunda_props") or {},
                }
                for f in facts
            ],
        },
        ensure_ascii=False,
    )
    for _attempt in range(2):  # retries = 1
        try:
            raw = caller(LLM_SYSTEM_PROMPT, user_prompt)
            obj = json.loads(raw)
            matches = obj.get("matches") if isinstance(obj, dict) else None
            if not isinstance(matches, list):
                continue
            out: Dict[str, str] = {}
            for item in matches:
                if not isinstance(item, dict):
                    continue
                element_id = str(item.get("element_id") or "")
                rule_id = item.get("rule_id")
                if element_id not in requested_ids:
                    continue
                if rule_id is None:
                    continue  # LLM честно не знает -> open_question
                rule_id = str(rule_id)
                if rule_id not in known_rules:
                    continue  # LLM hallucination -> reject
                # LLM2: confidence ниже порога -> open_question, не угадывание
                confidence = item.get("confidence")
                if confidence is not None:
                    try:
                        if float(confidence) < LLM_CONFIDENCE_THRESHOLD:
                            continue
                    except (TypeError, ValueError):
                        continue
                out[element_id] = rule_id
            return out, "llm"
        except Exception:
            continue
    return {}, "offline"


# ---------------------------------------------------------------------------
# Layer 3: draft build + tracing + validator pass
# ---------------------------------------------------------------------------

def _extract_recipe_vars(props: Dict[str, str]) -> List[str]:
    """Переменные recipe_context из ${recipe_context.X} значений camunda props."""
    out: List[str] = []
    for value in props.values():
        m = _RECIPE_CTX_RE.match(str(value).strip())
        if m and m.group(1) not in out:
            out.append(m.group(1))
    return out


def _build_draft_node(
    fact: Dict[str, Any],
    rule: Dict[str, Any],
    recipe_context: Dict[str, Any],
) -> Dict[str, Any]:
    """Построить draft-узел из AS IS задачи по правилу map_to_operation/extract_to_event."""
    props = fact.get("camunda_props") or {}
    params: Dict[str, Any] = {}
    for asis_key, tobe_key in (rule.get("params_map") or {}).items():
        value = props.get(asis_key)
        if value is None:
            continue
        value = str(value).strip()
        if value in PLACEHOLDER_VALUES or _DOLLAR_RE.search(value):
            continue  # заглушки и ${...}-подстановки не переносим
        params[tobe_key] = value
    for key, value in (rule.get("static_params") or {}).items():
        params.setdefault(key, value)

    recipe_params_map = rule.get("recipe_params_map") or {}
    recipe_params: List[str] = list(rule.get("recipe_params") or [])
    for var in _extract_recipe_vars(props):
        mapped = recipe_params_map.get(var, var)
        recipe_context.setdefault(mapped, "")
        if mapped not in recipe_params:
            recipe_params.append(mapped)

    outputs = {name: name for name in (rule.get("outputs") or [])}
    return {
        "id": fact["id"],
        "bpmn_type": "task",
        "name": fact.get("name") or "",
        "operation_code": rule.get("operation_code"),
        "display_name": fact.get("name") or rule.get("name") or None,
        "params": params,
        "outputs": outputs,
        "recipe_params": recipe_params,
        "x": fact.get("x", 0.0),
        "y": fact.get("y", 0.0),
        "width": fact.get("width") or 100.0,
        "height": fact.get("height") or 80.0,
        "derived_from": [fact["id"]],
    }


def _rewire_flows(
    flows: List[Dict[str, Any]],
    removed_ids: set,
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """Удалить потоки через удалённые узлы, добавив обходные. Возвращает (flows, fates)."""
    incoming: Dict[str, List[Dict[str, Any]]] = {}
    outgoing: Dict[str, List[Dict[str, Any]]] = {}
    for flow in flows:
        incoming.setdefault(flow["target_ref"], []).append(flow)
        outgoing.setdefault(flow["source_ref"], []).append(flow)

    kept: List[Dict[str, Any]] = []
    fates: Dict[str, str] = {}
    bypass_counter = 0
    for flow in flows:
        if flow["source_ref"] in removed_ids or flow["target_ref"] in removed_ids:
            fates[flow["id"]] = "dropped"
        else:
            kept.append(flow)
            fates[flow["id"]] = "transformed_to"

    existing_ids = {f["id"] for f in kept}
    for node_id in removed_ids:
        for fi in incoming.get(node_id, []):
            for fo in outgoing.get(node_id, []):
                if fi["source_ref"] in removed_ids or fo["target_ref"] in removed_ids:
                    continue
                bypass_counter += 1
                new_id = f"Flow_bypass_{bypass_counter}"
                while new_id in existing_ids:
                    bypass_counter += 1
                    new_id = f"Flow_bypass_{bypass_counter}"
                existing_ids.add(new_id)
                kept.append(
                    {
                        "id": new_id,
                        "source_ref": fi["source_ref"],
                        "target_ref": fo["target_ref"],
                        "name": fi.get("name") or "",
                        "condition": fi.get("condition") or "",
                    }
                )
    return kept, fates


def validate_draft_ui_model(ui_model: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Валидатор draft ui_model — E6.1: делегирует validation service (v0.3).

    Коды операций — из каталога; *_ref ссылки — объявлены в process_entities /
    recipe_context (иначе warning + draft entity); условия шлюзов — только из
    объявленных outputs задач. check_reachability=False: pipeline исторически
    не проверяет достижимость (это делает dry-run endpoint E6).
    Возвращает (report, draft_entities).
    """
    result = validate_ui_model(ui_model, catalog=None, check_reachability=False)
    report = {"summary": result["summary"], "findings": result["findings"]}
    return report, result["draft_entities"]


def build_draft(
    facts: Dict[str, Any],
    decisions: Dict[str, Optional[Dict[str, Any]]],
    decision_sources: Dict[str, str],
) -> Dict[str, Any]:
    """Слой 3: draft ui_model + trace map + open questions + валидатор."""
    ui_model = facts["ui_model"]
    recipe_context: Dict[str, Any] = {}
    draft_nodes: List[Dict[str, Any]] = []
    removed_ids: set = set()
    insert_after: Dict[str, str] = {}  # draft node id -> publish_event node id (emit_event)
    trace_map: List[Dict[str, Any]] = []
    open_questions: List[Dict[str, Any]] = []
    oq_counter = 0

    def add_question(element_id: str, question: str, source: str) -> None:
        nonlocal oq_counter
        oq_counter += 1
        open_questions.append(
            {"id": f"OQ_{oq_counter:03d}", "element_id": element_id, "question": question, "source": source, "status": "open"}
        )

    for fact in facts["elements"]:
        element_id = fact["id"]
        bpmn_type = fact["bpmn_type"]
        name = fact.get("name") or ""
        rule = decisions.get(element_id)

        if bpmn_type in _EVENT_TYPES or bpmn_type in _GATEWAY_TYPES:
            draft_nodes.append(
                {
                    "id": element_id,
                    "bpmn_type": bpmn_type,
                    "name": name,
                    "operation_code": None,
                    "display_name": name or None,
                    "params": {},
                    "outputs": {},
                    "recipe_params": [],
                    "x": fact.get("x", 0.0),
                    "y": fact.get("y", 0.0),
                    "width": fact.get("width") or 50.0,
                    "height": fact.get("height") or 50.0,
                    "derived_from": [element_id],
                }
            )
            trace_map.append(
                {
                    "element_id": element_id,
                    "element_type": bpmn_type,
                    "name": name,
                    "fate": "transformed_to",
                    "rule_id": None,
                    "rule_name": None,
                    "draft_node_ids": [element_id],
                    "note": "событие/шлюз перенесено без изменений",
                }
            )
            continue

        # task-like элементы
        for var in _extract_recipe_vars(fact.get("camunda_props") or {}):
            if rule and var in (rule.get("recipe_params_map") or {}):
                continue  # будет смаплено при построении узла
            recipe_context.setdefault(var, "")
            add_question(
                element_id,
                f"Переменная recipe_context '{var}' извлечена из legacy ${'{'}recipe_context.{var}{'}'} — подтвердите каноническое имя в TO BE.",
                "analyzer",
            )

        if rule is None:
            removed_ids.add(element_id)
            trace_map.append(
                {
                    "element_id": element_id,
                    "element_type": bpmn_type,
                    "name": name,
                    "fate": "open_question",
                    "rule_id": None,
                    "rule_name": None,
                    "draft_node_ids": [],
                    "note": "правило не найдено; в draft не переносится (не угадываем)",
                }
            )
            add_question(
                element_id,
                f"Задача «{name or element_id}» ({bpmn_type}) не распознана ни детерминированным мэтчером, ни LLM — решите её судьбу вручную.",
                "unmatched",
            )
            continue

        action = rule["to_be_action"]
        source = decision_sources.get(element_id, "deterministic")
        base_trace = {
            "element_id": element_id,
            "element_type": bpmn_type,
            "name": name,
            "rule_id": rule["id"],
            "rule_name": rule["name"],
            "source": source,
        }
        if action in ("map_to_operation", "extract_to_event"):
            node = _build_draft_node(fact, rule, recipe_context)
            draft_ids = [node["id"]]
            draft_nodes.append(node)
            emit_event = rule.get("emit_event")
            if emit_event:
                event_node = {
                    "id": f"{element_id}__publish",
                    "bpmn_type": "task",
                    "name": f"Опубликовать событие {emit_event}",
                    "operation_code": "publish_event",
                    "display_name": f"Опубликовать событие {emit_event}",
                    "params": {"event_code": emit_event},
                    "outputs": {},
                    "recipe_params": [],
                    "x": (fact.get("x") or 0.0) + 170.0,
                    "y": fact.get("y") or 0.0,
                    "width": 100.0,
                    "height": 80.0,
                    "derived_from": [element_id],
                }
                draft_nodes.append(event_node)
                draft_ids.append(event_node["id"])
                insert_after[node["id"]] = event_node["id"]
            trace_map.append(
                {
                    **base_trace,
                    "fate": "transformed_to",
                    "draft_node_ids": draft_ids,
                    "note": f"{rule.get('rationale') or ''} (операция: {node['operation_code']})",
                }
            )
        elif action == "push_below":
            removed_ids.add(element_id)
            trace_map.append(
                {**base_trace, "fate": "pushed_below", "draft_node_ids": [], "note": rule.get("rationale") or ""}
            )
        elif action == "drop":
            removed_ids.add(element_id)
            trace_map.append(
                {**base_trace, "fate": "dropped", "draft_node_ids": [], "note": rule.get("rationale") or ""}
            )
        elif action in ("extract_to_recipe", "extract_to_contract"):
            removed_ids.add(element_id)
            for var in rule.get("recipe_params") or []:
                recipe_context.setdefault(var, "")
            trace_map.append(
                {**base_trace, "fate": "pushed_below", "draft_node_ids": [], "note": rule.get("rationale") or ""}
            )
        else:
            removed_ids.add(element_id)
            trace_map.append(
                {**base_trace, "fate": "open_question", "draft_node_ids": [], "note": f"неизвестное действие правила '{action}'"}
            )
            add_question(element_id, f"Правило {rule['id']} имеет неподдерживаемое действие '{action}'.", "analyzer")

        if rule.get("open_question"):
            add_question(element_id, str(rule["open_question"]).format(name=name or element_id), "rule")

    # --- потоки: обход удалённых узлов --------------------------------------
    flows, flow_fates = _rewire_flows(ui_model.get("flows") or [], removed_ids)
    # emit_event: вставить publish_event после исходного узла (a -> publish -> b)
    for anchor_id, publish_id in insert_after.items():
        rerouted: List[Dict[str, Any]] = []
        targets: List[str] = []
        for flow in flows:
            if flow["source_ref"] == anchor_id:
                targets.append(flow["target_ref"])
                rerouted.append({**flow, "source_ref": publish_id})
            else:
                rerouted.append(flow)
        flows = rerouted
        flows.insert(
            0,
            {
                "id": f"Flow_emit_{anchor_id}",
                "source_ref": anchor_id,
                "target_ref": publish_id,
                "name": "",
                "condition": "",
            },
        )
        if not targets:  # у anchor не было исходящих — publish ведёт в endEvent если найдём
            end_nodes = [n["id"] for n in draft_nodes if n.get("bpmn_type") == "endEvent"]
            if end_nodes:
                flows.append(
                    {
                        "id": f"Flow_emit_{publish_id}_end",
                        "source_ref": publish_id,
                        "target_ref": end_nodes[0],
                        "name": "",
                        "condition": "",
                    }
                )
    for flow in ui_model.get("flows") or []:
        trace_map.append(
            {
                "element_id": flow["id"],
                "element_type": "sequenceFlow",
                "name": flow.get("name") or "",
                "fate": flow_fates.get(flow["id"], "transformed_to"),
                "rule_id": None,
                "rule_name": None,
                "draft_node_ids": [],
                "note": "" if flow_fates.get(flow["id"]) == "transformed_to" else "заменён обходным потоком",
            }
        )
    for annotation in facts.get("annotations") or []:
        trace_map.append(
            {
                "element_id": annotation["id"],
                "element_type": "textAnnotation",
                "name": (annotation.get("text") or "")[:80],
                "fate": "pushed_below",
                "rule_id": None,
                "rule_name": None,
                "draft_node_ids": [],
                "note": "контекст аннотации учтён в recipe_context / открытых вопросах",
            }
        )

    draft_ui_model = {
        "process_template_id": f"{ui_model.get('process_template_id') or 'asis'}_tobe_draft",
        "recipe_context": recipe_context,
        "process_entities": {},
        "nodes": draft_nodes,
        "flows": flows,
        "participant": ui_model.get("participant"),
        "lanes": ui_model.get("lanes") or [],
    }

    # --- анализаторы открытых вопросов (E35.3) -------------------------------
    op_codes = {n.get("operation_code") for n in draft_nodes}
    if "start_equipment" in op_codes and "measure_temperature" not in op_codes:
        add_question(
            "",
            "В AS IS после нагрева нет рецептурной проверки температуры — подтвердите необходимость measure_temperature (порог target_temp_c) и capability измерения на целевой кухне.",
            "analyzer",
        )
    has_packaging_move = any(
        str((n.get("params") or {}).get("target_ref") or "").startswith("packaging") for n in draft_nodes
    )
    if has_packaging_move and "publish_event" not in op_codes:
        add_question(
            "",
            "Тара перемещается в зону упаковки, но событие ready_for_packaging не публикуется — подтвердите точку публикации события для процесса упаковки (v0.3 §16).",
            "analyzer",
        )
    if any(t["fate"] == "dropped" for t in trace_map):
        dropped_names = [t["name"] or t["element_id"] for t in trace_map if t["fate"] == "dropped" and t["element_type"] != "sequenceFlow"]
        if dropped_names:
            add_question(
                "",
                "Элементы исключены из схемы (human loop / legacy): " + ", ".join(dropped_names[:8]) + " — подтвердите, что они покрыты инструкциями оператора.",
                "analyzer",
            )

    # --- ОБЯЗАТЕЛЬНЫЙ прогон валидатора --------------------------------------
    for _iteration in range(3):
        report, draft_entities = validate_draft_ui_model(draft_ui_model)
        error_node_ids = {f["element_id"] for f in report["findings"] if f["severity"] == "error" and f["element_id"]}
        node_ids = {str(n.get("id")) for n in draft_ui_model["nodes"]}
        failing_nodes = error_node_ids & node_ids
        failing_flows = error_node_ids - node_ids
        if not failing_nodes and not failing_flows:
            break
        # узлы с ошибками -> удалить и пометить open_question (валидатор отвергает)
        for node_id in failing_nodes:
            draft_ui_model["nodes"] = [n for n in draft_ui_model["nodes"] if str(n.get("id")) != node_id]
            removed_ids.add(node_id)
            derived = next((n.get("derived_from") or [node_id] for n in draft_nodes if str(n.get("id")) == node_id), [node_id])
            add_question(
                derived[0],
                f"Draft-узел '{node_id}' отвергнут валидатором v0.3 и удалён из draft — требуется ручное решение.",
                "validator",
            )
            for entry in trace_map:
                if node_id in (entry.get("draft_node_ids") or []):
                    entry["fate"] = "open_question"
                    entry["draft_node_ids"] = [d for d in entry["draft_node_ids"] if d != node_id]
                    entry["note"] = (entry.get("note") or "") + " | отвергнуто валидатором"
        # потоки с ошибками условий -> очистить условие
        for flow in draft_ui_model["flows"]:
            if str(flow.get("id")) in failing_flows:
                add_question(
                    flow["id"],
                    f"Условие потока '{flow['id']}' ссылается на необъявленный output и было очищено валидатором: {flow.get('condition')}",
                    "validator",
                )
                flow["condition"] = ""
        draft_ui_model["flows"], _ = _rewire_flows(draft_ui_model["flows"], removed_ids & node_ids)

    final_report, draft_entities = validate_draft_ui_model(draft_ui_model)
    return {
        "draft_ui_model": draft_ui_model,
        "trace_map": trace_map,
        "open_questions": open_questions,
        "validation_report": final_report,
        "draft_entities": draft_entities,
    }


# ---------------------------------------------------------------------------
# Pipeline entry point
# ---------------------------------------------------------------------------

def transform_asis(
    xml_text: str,
    *,
    rules: Optional[List[Dict[str, Any]]] = None,
    llm_call: Optional[Callable[[str, str], str]] = None,
    llm_enabled: bool = True,
) -> Dict[str, Any]:
    """Полный конвейер AS IS -> TO BE draft. Никогда не падает из-за LLM."""
    rules = rules if rules is not None else load_rules()
    facts = extract_facts(xml_text)

    decisions: Dict[str, Optional[Dict[str, Any]]] = {}
    decision_sources: Dict[str, str] = {}
    unmatched: List[Dict[str, Any]] = []
    for fact in facts["elements"]:
        if fact["bpmn_type"] not in _TASK_LIKE:
            continue
        winners = match_deterministic_winners(fact, rules)
        if len(winners) == 1:
            decisions[fact["id"]] = winners[0]
            decision_sources[fact["id"]] = "deterministic"
        elif len(winners) > 1:
            # LLM2: tie между правилами → LLM-арбитр (не угадываем первым по списку);
            # оффлайн/низкий confidence → open_question
            decisions[fact["id"]] = None
            unmatched.append(fact)
        else:
            decisions[fact["id"]] = None
            # безымянные/пустые задачи LLM не поможет — сразу open_question
            if not (fact.get("name") or "").strip() and not (fact.get("camunda_props") or {}):
                decision_sources[fact["id"]] = "unmatched"
            else:
                unmatched.append(fact)

    llm_status = "disabled"
    if unmatched and llm_enabled:
        llm_matches, llm_status = match_with_llm(unmatched, rules, llm_call=llm_call)
        by_id = {r["id"]: r for r in rules}
        for element_id, rule_id in llm_matches.items():
            decisions[element_id] = by_id[rule_id]
            decision_sources[element_id] = "llm"
        for fact in unmatched:
            decision_sources.setdefault(fact["id"], "unmatched")
    elif unmatched:
        llm_status = "disabled"
        for fact in unmatched:
            decision_sources[fact["id"]] = "unmatched"

    built = build_draft(facts, decisions, decision_sources)
    built["as_is_ui_model"] = facts["ui_model"]
    built["as_is_report"] = facts["import_report"]
    built["llm_status"] = llm_status
    return built
