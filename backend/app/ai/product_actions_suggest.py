from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from .deepseek_questions import _deepseek_chat_json


PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE = """Ты помогаешь заполнить реестр действий с продуктом для пищевого процесса.

Верни только JSON без markdown. Формат:
{
  "suggestions": [
    {
      "step_id": "",
      "bpmn_element_id": "",
      "step_label": "",
      "product_name": "",
      "product_group": "",
      "action_type": "",
      "action_stage": "",
      "action_object": "",
      "action_object_category": "",
      "action_method": "",
      "role": "",
      "confidence": 0.0,
      "evidence_text": "",
      "warnings": []
    }
  ],
  "warnings": []
}

Правила:
- Предлагай только физические действия сотрудников с продуктом, ингредиентом, полуфабрикатом, готовым блюдом, тарой, контейнером или упаковкой.
- Игнорируй чисто информационные, системные, организационные и согласовательные шаги, если в них нет физического действия с продуктом/тарой/упаковкой.
- Предлагай только действия, которые явно следуют из BPMN/Interview шагов.
- Не придумывай товары, группы товаров или методы, если в шаге нет продуктового контекста.
- Для каждого candidate заполни: product_name, product_group, action_type, action_stage, action_object, action_object_category, action_method, role, step_id, bpmn_element_id, confidence, evidence_text, warnings.
- evidence_text должен коротко указывать фразу/шаг, из которого сделан вывод.
- Если поле неизвестно, оставь пустую строку и снизь confidence.
- Не повторяй уже сохранённые product_actions; если действие похоже на существующее, всё равно верни его только при явной новой детали.
- Не меняй BPMN и не пиши финальные данные, это только suggestions для review.
"""

_SUGGESTION_FIELDS = (
    "step_id",
    "bpmn_element_id",
    "step_label",
    "product_name",
    "product_group",
    "action_type",
    "action_stage",
    "action_object",
    "action_object_category",
    "action_method",
    "role",
    "evidence_text",
)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _confidence(value: Any) -> float:
    try:
        parsed = float(value)
    except Exception:
        return 0.0
    if parsed < 0:
        return 0.0
    if parsed > 1:
        return 1.0
    return parsed


def _as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def normalize_product_action_suggestion(raw: Any, *, index: int = 0) -> Dict[str, Any]:
    item = raw if isinstance(raw, dict) else {}
    out: Dict[str, Any] = {"id": _text(item.get("id")) or f"ai_pa_{index + 1}"}
    for key in _SUGGESTION_FIELDS:
        out[key] = _text(item.get(key))
    if not out["bpmn_element_id"]:
        out["bpmn_element_id"] = _text(item.get("node_id") or item.get("bpmnElementId"))
    out["node_id"] = _text(item.get("node_id")) or out["bpmn_element_id"]
    out["confidence"] = _confidence(item.get("confidence"))
    warnings = []
    for warning in _as_list(item.get("warnings")):
        text = _text(warning.get("message") if isinstance(warning, dict) else warning)
        if text:
            warnings.append({"code": _text(warning.get("code")) if isinstance(warning, dict) else "warning", "message": text})
    out["warnings"] = warnings
    missing = [key for key in ("product_name", "product_group", "action_type", "action_object") if not out.get(key)]
    out["missing_fields"] = missing
    out["source"] = "ai_suggested"
    out["manual_corrected"] = False
    return out


def normalize_product_action_suggestions_response(raw: Any, *, max_suggestions: int = 20) -> Dict[str, Any]:
    payload = raw if isinstance(raw, dict) else {}
    raw_suggestions = payload.get("suggestions")
    if raw_suggestions is None and isinstance(raw, list):
        raw_suggestions = raw
    suggestions = [
        normalize_product_action_suggestion(item, index=index)
        for index, item in enumerate(_as_list(raw_suggestions)[: max(1, int(max_suggestions or 20))])
    ]
    warnings = []
    for warning in _as_list(payload.get("warnings")):
        text = _text(warning.get("message") if isinstance(warning, dict) else warning)
        if text:
            warnings.append({"code": _text(warning.get("code")) if isinstance(warning, dict) else "warning", "message": text})
    return {"suggestions": suggestions, "warnings": warnings}


def suggest_product_actions_with_deepseek(
    *,
    context: Dict[str, Any],
    api_key: str,
    base_url: str,
    prompt_template: Optional[str] = None,
    max_suggestions: int = 20,
) -> Dict[str, Any]:
    system_prompt = str(prompt_template or PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE)
    user_payload = json.dumps(context if isinstance(context, dict) else {}, ensure_ascii=False, sort_keys=True)
    raw = _deepseek_chat_json(
        api_key=api_key,
        base_url=base_url,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_payload},
        ],
        timeout=45,
        max_tokens=2400,
    )
    return normalize_product_action_suggestions_response(raw, max_suggestions=max_suggestions)
