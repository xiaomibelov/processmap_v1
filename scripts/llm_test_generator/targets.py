"""Отбор целей для генерации из build/api-coverage-results.json + exclusions.yaml.

Приоритет: read-only GET → безопасные POST из whitelist (method_policy
allowed_extra_operations) → остальное. Операции из exclusions.yaml
(skip_operations / LLM-конверты) пропускаются с указанием reason.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
COVERAGE_RESULTS = REPO_ROOT / "build" / "api-coverage-results.json"
EXCLUSIONS_PATH = REPO_ROOT / "backend" / "tests" / "contract" / "exclusions.yaml"


def load_coverage(path: Optional[Path] = None) -> Dict[str, Any]:
    p = path or COVERAGE_RESULTS
    return json.loads(p.read_text(encoding="utf-8"))


def load_excluded_ids() -> Dict[str, str]:
    """operationId → reason (skip_operations + domain_error_envelope + spec-gap).

    spec-gap НЕ исключаем из целей: доменные 4xx там осознанные, тесты на них
    как раз полезны. Исключаем только то, что contract-suite не фаззит вообще
    (sqlite-env, SSE, внешние вызовы) и LLM-конверты (нестабильный контракт).
    """
    data = yaml.safe_load(EXCLUSIONS_PATH.read_text(encoding="utf-8"))
    out: Dict[str, str] = {}
    for key in ("skip_operations", "domain_error_envelope_operations"):
        for entry in data.get(key) or []:
            out[entry["id"]] = entry.get("reason", "")
    return out


def load_post_whitelist() -> List[str]:
    """POST-операции, признанные безопасными в contract-контуре."""
    data = yaml.safe_load(EXCLUSIONS_PATH.read_text(encoding="utf-8"))
    policy = data.get("method_policy") or {}
    return [e["id"] for e in policy.get("allowed_extra_operations") or []]


def select_targets(
    coverage: Dict[str, Any],
    *,
    tag: Optional[str] = None,
    limit: int = 5,
    include_covered: bool = False,
) -> List[Dict[str, Any]]:
    """Возвращает до limit целей, отсортированных по приоритету.

    Цель = dict из coverage results + поле priority (0=GET, 1=whitelist POST, 2=остальное)
    + missing_statuses (documented − seen).
    """
    excluded = load_excluded_ids()
    post_whitelist = set(load_post_whitelist())
    candidates: List[Dict[str, Any]] = []
    for op in coverage.get("operations") or []:
        op_id = op.get("operation_id") or ""
        if not op_id or op_id in excluded:
            continue
        if op.get("status") == "covered" and not include_covered:
            continue
        if tag and tag not in (op.get("tags") or []):
            continue
        method = str(op.get("method") or "").upper()
        if method in ("GET", "HEAD"):
            priority = 0
        elif method == "POST" and op_id in post_whitelist:
            priority = 1
        else:
            priority = 2
        documented = {str(s) for s in op.get("documented_statuses") or []}
        seen = {str(s) for s in op.get("seen_statuses") or []}
        missing = sorted(documented - seen)
        candidates.append({**op, "priority": priority, "missing_statuses": missing})
    candidates.sort(key=lambda c: (c["priority"], -len(c["missing_statuses"]), c["path"]))
    return candidates[:limit]
