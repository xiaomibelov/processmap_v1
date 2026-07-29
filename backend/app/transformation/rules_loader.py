"""E35.1 — загрузчик библиотеки правил трансформации.

rules.yaml — редактируемый артефакт (НЕ зашит в промпты). Загрузчик валидирует
структуру каждого правила и может засеять таблицу transformation_rule (миграция 004).
"""
from __future__ import annotations

import os
import uuid
from typing import Any, Dict, List, Optional

import yaml

ALLOWED_ACTIONS = {
    "map_to_operation",
    "push_below",
    "drop",
    "extract_to_recipe",
    "extract_to_contract",
    "extract_to_event",
}

DEFAULT_RULES_PATH = os.path.join(os.path.dirname(__file__), "rules.yaml")


class RulesLoadError(ValueError):
    """Raised when the rule library YAML is structurally invalid."""


def _validate_rule(raw: Any, index: int) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise RulesLoadError(f"rule #{index}: expected mapping, got {type(raw).__name__}")
    rule = dict(raw)
    rule_id = str(rule.get("id") or "").strip()
    if not rule_id:
        raise RulesLoadError(f"rule #{index}: missing id")
    rule["id"] = rule_id
    if not str(rule.get("name") or "").strip():
        raise RulesLoadError(f"rule {rule_id}: missing name")
    action = str(rule.get("to_be_action") or "").strip()
    if action not in ALLOWED_ACTIONS:
        raise RulesLoadError(f"rule {rule_id}: unknown to_be_action '{action}'")
    rule["to_be_action"] = action
    pattern = rule.get("as_is_pattern")
    if not isinstance(pattern, dict) or not pattern:
        raise RulesLoadError(f"rule {rule_id}: as_is_pattern must be a non-empty mapping")
    keywords = pattern.get("name_keywords") or []
    if not isinstance(keywords, list):
        raise RulesLoadError(f"rule {rule_id}: name_keywords must be a list")
    props = pattern.get("camunda_props") or {}
    if not isinstance(props, dict):
        raise RulesLoadError(f"rule {rule_id}: camunda_props must be a mapping")
    if action in ("map_to_operation", "extract_to_event") and not str(rule.get("operation_code") or "").strip():
        raise RulesLoadError(f"rule {rule_id}: action '{action}' requires operation_code")
    rule["priority"] = int(rule.get("priority") or 0)
    for key in ("params_map", "static_params", "recipe_params_map"):
        value = rule.get(key) or {}
        if not isinstance(value, dict):
            raise RulesLoadError(f"rule {rule_id}: {key} must be a mapping")
        rule[key] = value
    for key in ("outputs", "recipe_params"):
        value = rule.get(key) or []
        if not isinstance(value, list):
            raise RulesLoadError(f"rule {rule_id}: {key} must be a list")
        rule[key] = [str(v) for v in value]
    rule.setdefault("task_types", None)
    return rule


def load_rules(path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Load and validate the rule library from YAML."""
    rules_path = path or os.environ.get("TRANSFORMATION_RULES_PATH") or DEFAULT_RULES_PATH
    with open(rules_path, "r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict) or not isinstance(data.get("rules"), list):
        raise RulesLoadError(f"{rules_path}: top-level 'rules' list not found")
    rules = [_validate_rule(raw, idx) for idx, raw in enumerate(data["rules"])]
    seen = set()
    for rule in rules:
        if rule["id"] in seen:
            raise RulesLoadError(f"duplicate rule id '{rule['id']}'")
        seen.add(rule["id"])
    rules.sort(key=lambda r: -r["priority"])
    return rules


def rule_summary(rule: Dict[str, Any]) -> Dict[str, Any]:
    """Compact view of a rule for LLM prompts (no secrets, YAML stays the source)."""
    return {
        "id": rule["id"],
        "name": rule["name"],
        "to_be_action": rule["to_be_action"],
        "operation_code": rule.get("operation_code"),
        "rationale": rule.get("rationale") or "",
    }


def seed_rules_to_db(rules: List[Dict[str, Any]], database_url: Optional[str] = None) -> int:
    """Upsert rules into transformation_rule table (migration 004). Returns count."""
    import json

    import psycopg

    url = database_url or os.environ.get("DATABASE_URL") or ""
    if not url:
        raise RulesLoadError("DATABASE_URL is not set; cannot seed transformation_rule")
    count = 0
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            for rule in rules:
                cur.execute(
                    """
                    INSERT INTO transformation_rule
                        (id, rule_id, name, pattern, action, operation_code,
                         rationale, format_ref, priority, enabled, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, now())
                    ON CONFLICT (rule_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        pattern = EXCLUDED.pattern,
                        action = EXCLUDED.action,
                        operation_code = EXCLUDED.operation_code,
                        rationale = EXCLUDED.rationale,
                        format_ref = EXCLUDED.format_ref,
                        priority = EXCLUDED.priority,
                        enabled = TRUE,
                        updated_at = now()
                    """,
                    (
                        uuid.uuid4().hex,
                        rule["id"],
                        rule["name"],
                        json.dumps(rule.get("as_is_pattern") or {}, ensure_ascii=False),
                        rule["to_be_action"],
                        rule.get("operation_code"),
                        rule.get("rationale") or "",
                        rule.get("format_ref") or "",
                        rule["priority"],
                    ),
                )
                count += 1
        conn.commit()
    return count
