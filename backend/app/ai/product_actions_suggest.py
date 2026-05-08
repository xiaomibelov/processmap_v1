from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from . import deepseek_questions as _dq


class ProductActionsAiResponseParseError(ValueError):
    """Raised when the provider returned text that cannot be parsed as suggestions JSON."""


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
- Return only valid JSON object matching schema. No markdown, no comments, no trailing commas.
"""

PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE_V4 = """Ты помогаешь заполнить реестр действий с продуктом для пищевого процесса.

Верни не более 3 предложений. Все строковые поля — не более 60 символов.

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
      "confidence": "low|medium|high",
      "reason": ""
    }
  ],
  "warnings": []
}

Правила:
- Предлагай только физические действия сотрудников с продуктом, ингредиентом, полуфабрикатом, готовым блюдом, тарой, контейнером или упаковкой.
- Игнорируй чисто информационные, системные, организационные и согласовательные шаги, если в них нет физического действия с продуктом/тарой/упаковкой.
- Предлагай только действия, которые явно следуют из BPMN/Interview шагов.
- Не придумывай товары, группы товаров или методы, если в шаге нет продуктового контекста.
- Для каждого candidate заполни: product_name, product_group, action_type, action_stage, action_object, action_object_category, action_method, role, step_id, bpmn_element_id, confidence, reason.
- reason должен коротко указывать фразу/шаг, из которого сделан вывод (не более 60 символов).
- confidence: "high" — явно следует из шага, "medium" — вероятно, "low" — предположение.
- Если поле неизвестно, оставь пустую строку и снизь confidence.
- Не повторяй уже сохранённые product_actions; если действие похоже на существующее, всё равно верни его только при явной новой детали.
- Не меняй BPMN и не пиши финальные данные, это только suggestions для review.
- Return only valid JSON object matching schema. No markdown, no comments, no trailing commas.
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
    "reason",
    "duplicate_of",
    "duplicate_reason",
)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _confidence(value: Any) -> float:
    if isinstance(value, str):
        mapping = {"high": 1.0, "medium": 0.6, "low": 0.3}
        v = value.strip().lower()
        if v in mapping:
            return mapping[v]
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


def normalize_product_action_suggestions_response(raw: Any, *, max_suggestions: int = 3) -> Dict[str, Any]:
    payload = raw if isinstance(raw, dict) else {}
    raw_suggestions = payload.get("suggestions")
    if raw_suggestions is None and isinstance(raw, list):
        raw_suggestions = raw
    cap = max(1, int(max_suggestions or 3))
    suggestions = [
        normalize_product_action_suggestion(item, index=index)
        for index, item in enumerate(_as_list(raw_suggestions)[:cap])
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
    max_suggestions: int = 3,
) -> Dict[str, Any]:
    system_prompt = str(prompt_template or PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE)
    user_payload = json.dumps(context if isinstance(context, dict) else {}, ensure_ascii=False, sort_keys=True)
    base = (base_url or "https://api.deepseek.com").strip().rstrip("/")
    data = _dq._deepseek_chat_request(
        api_key=api_key,
        base_url=base,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_payload},
        ],
        temperature=0.0,
        timeout=45,
        max_tokens=4000,
    )
    content = data["choices"][0]["message"]["content"]
    cand = _dq._extract_json_candidate(content)
    if not cand:
        parse_exc = ProductActionsAiResponseParseError("no valid json object in response")
        parse_exc.raw_content = str(content or "")[:500]
        raise parse_exc
    try:
        raw = json.loads(cand)
    except json.JSONDecodeError as exc:
        parse_exc = ProductActionsAiResponseParseError(
            f"invalid json response: {exc.msg} at line {exc.lineno} column {exc.colno}"
        )
        parse_exc.raw_content = str(cand or "")[:500]
        raise parse_exc from exc
    return normalize_product_action_suggestions_response(raw, max_suggestions=max_suggestions)
