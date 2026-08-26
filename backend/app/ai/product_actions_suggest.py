from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from . import deepseek_questions as _dq


class ProductActionsAiResponseParseError(ValueError):
    """Raised when the provider returned text that cannot be parsed as suggestions JSON."""


def _strip_fences(text: str) -> str:
    """Remove markdown code fences and optional language tag."""
    t = str(text or "").strip()
    # Strip opening fence with optional language
    t = re.sub(r"^```[a-zA-Z0-9_+-]*\s*\n?", "", t, flags=re.IGNORECASE)
    # Strip closing fence
    t = re.sub(r"\n?\s*```\s*$", "", t)
    return t.strip()


def _extract_first_json_block(text: str) -> Optional[str]:
    """Find the first {...} or [...] block that is valid JSON.

    Handles explanatory text before/after JSON and nested braces.
    """
    t = _strip_fences(text)
    if not t:
        return None

    # Fast path: whole text is already valid JSON.
    try:
        json.loads(t)
        return t
    except Exception:
        pass

    # Scan for the first balanced JSON block.
    for match in re.finditer(r"(\{|\[)", t):
        start = match.start()
        stack = []
        in_string = False
        escaped = False
        for i in range(start, len(t)):
            ch = t[i]
            if in_string:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == '"':
                    in_string = False
                continue
            if ch == '"':
                in_string = True
                continue
            if ch in {"{", "["}:
                stack.append(ch)
            elif ch == "}" and stack and stack[-1] == "{":
                stack.pop()
            elif ch == "]" and stack and stack[-1] == "[":
                stack.pop()
            if not stack:
                candidate = t[start : i + 1]
                try:
                    json.loads(candidate)
                    return candidate
                except Exception:
                    break
        # If we exit with non-empty stack, the block is truncated; try to repair below.
    return None


def _repair_truncated_json(text: str) -> Optional[str]:
    """Try to extract the largest valid JSON prefix from a truncated object/array.

    Useful when response was cut off by max_tokens mid-object.
    """
    t = _strip_fences(text)
    if not t:
        return None

    # Find the outermost opening brace/bracket.
    start = -1
    for i, ch in enumerate(t):
        if ch in {"{", "["}:
            start = i
            break
    if start < 0:
        return None

    open_char = t[start]
    close_char = "}" if open_char == "{" else "]"

    # Try progressively shorter suffixes to find a valid prefix.
    for cut in range(len(t), start, -1):
        candidate = t[start:cut]
        # Balance check: count unescaped braces/brackets.
        stack = []
        in_string = False
        escaped = False
        balanced = True
        for ch in candidate:
            if in_string:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == '"':
                    in_string = False
                continue
            if ch == '"':
                in_string = True
                continue
            if ch in {"{", "["}:
                stack.append(ch)
            elif ch in {"}", "]"}:
                if not stack:
                    balanced = False
                    break
                top = stack[-1]
                if (ch == "}" and top != "{") or (ch == "]" and top != "["):
                    balanced = False
                    break
                stack.pop()
        if not balanced or stack:
            continue
        try:
            json.loads(candidate)
            return candidate
        except Exception:
            continue
    return None


def _extract_json_candidate_robust(text: str) -> Optional[str]:
    """Tolerant JSON extraction for LLM responses.

    Order:
    1. Strip markdown fences and parse whole text.
    2. Find first valid JSON block inside explanatory text.
    3. Try to repair a truncated JSON object/array.
    """
    # First try the existing shared helper to keep behaviour for clean responses.
    candidate = _dq._extract_json_candidate(text)
    if candidate:
        try:
            json.loads(candidate)
            return candidate
        except Exception:
            pass
    candidate = _extract_first_json_block(text)
    if candidate:
        return candidate
    return _repair_truncated_json(text)


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

PRODUCT_ACTIONS_SUGGEST_REPAIR_PROMPT_TEMPLATE = """Ты исправляешь свой предыдущий ответ, который не удалось разобрать как валидный JSON.

Требование: верни ТОЛЬКО валидный JSON без markdown, без пояснений, без комментариев.

Формат:
{
  "suggestions": [
    {
      "action_text": "",
      "tags": { "action_type": "", "action_stage": "", "action_object": "", "action_method": "" },
      "product_name": "",
      "product_group": "",
      "step_id": "",
      "bpmn_element_id": "",
      "step_label": "",
      "role": "",
      "confidence": 0.0,
      "reason": ""
    }
  ],
  "warnings": []
}

Предыдущий ответ (ошибка разбора: {parse_error}):
{input}

Исправь предыдущий ответ и верни только JSON."""


PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE_V4 = """Ты помогаешь заполнить реестр действий с продуктом для пищевого процесса.

Верни не более 3 предложений. Все строковые поля — не более 120 символов.

Верни только JSON без markdown. Формат:
{
  "suggestions": [
    {
      "step_id": "",
      "bpmn_element_id": "",
      "step_label": "",
      "action_text": "",
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
- Каждое предложение — это глагольная формулировка физического действия. Обязательно заполни поле action_text (например: "Перелить суп из контейнера в гастроёмкость", "Нарезать куриную грудку ножом").
- Игнорируй чисто информационные, системные, организационные и согласовательные шаги, если в них нет физического действия с продуктом/тарой/упаковкой.
- Предлагай только действия, которые явно следуют из BPMN/Interview шагов.
- Не придумывай товары, группы товаров или методы, если в шаге нет продуктового контекста.
- Для каждого candidate заполни: action_text, product_name, product_group, action_type, action_stage, action_object, action_object_category, action_method, role, step_id, bpmn_element_id, confidence, reason.
- reason должен коротко указывать фразу/шаг, из которого сделан вывод (не более 120 символов).
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
    "action_text",
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


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def normalize_product_action_suggestion(raw: Any, *, index: int = 0) -> Dict[str, Any]:
    item = raw if isinstance(raw, dict) else {}
    tags = _as_dict(item.get("tags"))
    out: Dict[str, Any] = {"id": _text(item.get("id")) or f"ai_pa_{index + 1}"}
    for key in _SUGGESTION_FIELDS:
        if tags and key in tags:
            out[key] = _text(tags.get(key))
        else:
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
    missing = [key for key in ("action_text", "action_type", "action_stage", "action_object", "action_method") if not out.get(key)]
    out["missing_fields"] = missing
    out["source"] = "ai_suggested"
    out["manual_corrected"] = False
    return out


# Known wrapper keys for suggestion arrays. LLMs sometimes use "actions",
# "items", "results", or "data" instead of "suggestions".
_SUGGESTION_WRAPPER_KEYS = ("suggestions", "actions", "items", "results", "data")


def _extract_suggestions_array(payload: Any) -> Optional[List[Any]]:
    """Extract the suggestions array from common LLM response wrappers."""
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return None
    for key in _SUGGESTION_WRAPPER_KEYS:
        value = payload.get(key)
        if isinstance(value, list):
            return value
    return None


def normalize_product_action_suggestions_response(raw: Any, *, max_suggestions: int = 3) -> Dict[str, Any]:
    payload = raw if isinstance(raw, dict) else {}
    raw_suggestions = _extract_suggestions_array(raw)
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


def _looks_like_suggestions_payload(raw: Any) -> bool:
    """Return True if the parsed JSON is a list or a dict with a known wrapper key."""
    if isinstance(raw, list):
        return True
    if not isinstance(raw, dict):
        return False
    if not raw:
        return True
    return any(key in raw for key in _SUGGESTION_WRAPPER_KEYS)


def parse_product_actions_suggestions(text: str, max_suggestions: int = 3) -> Dict[str, Any]:
    """Parse gateway/agent-service response text into normalized suggestions dict.

    Raises ProductActionsAiResponseParseError with raw_content set on failure.
    """
    content = str(text or "")
    cand = _extract_json_candidate_robust(content)
    if not cand:
        parse_exc = ProductActionsAiResponseParseError("no valid json object in response")
        parse_exc.raw_content = content[:1000]
        raise parse_exc
    try:
        raw = json.loads(cand)
    except json.JSONDecodeError as exc:
        parse_exc = ProductActionsAiResponseParseError(
            f"invalid json response: {exc.msg} at line {exc.lineno} column {exc.colno}"
        )
        parse_exc.raw_content = str(cand or "")[:1000]
        raise parse_exc from exc
    if not _looks_like_suggestions_payload(raw):
        parse_exc = ProductActionsAiResponseParseError(
            "response json does not contain a suggestions array"
        )
        parse_exc.raw_content = str(cand or "")[:1000]
        raise parse_exc
    return normalize_product_action_suggestions_response(raw, max_suggestions=max_suggestions)


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
    return parse_product_actions_suggestions(content, max_suggestions=max_suggestions)
