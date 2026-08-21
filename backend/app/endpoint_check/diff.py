"""Дифф результатов endpoint-сканера против прошлого завершённого прогона.

Чистая функция (без БД и HTTP) — легко тестируется на фейковых данных.

Группы категорий:
- ok — успех (2xx/3xx);
- error — HTTP-ошибки/таймауты/ошибки соединения (http_error, timeout, conn_error);
- domain — доменная ошибка в 200-конверте (domain_error).

Матрица (prev → cur), cur-группа:
- ok:    prev ok → ok; prev error → fixed; prev domain → domain_fixed;
- error: prev ok → new_error; prev error → still_failing (сменился fingerprint —
         тоже still_failing, но note 'fingerprint changed'); prev domain → new_error
         (note: раньше была доменная ошибка);
- domain: prev ok → new_domain_error; prev domain → still_domain_error
         (смена fingerprint — note 'fingerprint changed'); prev error →
         new_domain_error (note: раньше была HTTP-ошибка);
- prev отсутствует → new_endpoint (текущее состояние — в note).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

OK = "ok"
DOMAIN = "domain_error"
_ERROR_CATEGORIES = {"http_error", "timeout", "conn_error"}


def _group(category: str) -> str:
    cat = str(category or "").strip()
    if cat == OK:
        return OK
    if cat == DOMAIN:
        return DOMAIN
    return "error"


def compute_diff(
    prev_results: List[Dict[str, Any]],
    cur_results: List[Dict[str, Any]],
) -> Dict[str, Tuple[str, str]]:
    """prev/cur — списки dict с operation_id, category, fingerprint.

    Возвращает {operation_id: (diff_status, note_suffix)} для каждой записи cur.
    note_suffix может быть пустым — тогда note результата не дополняется.
    """
    prev_by_op: Dict[str, Dict[str, Any]] = {}
    for row in prev_results:
        op_id = str((row or {}).get("operation_id") or "")
        if op_id:
            prev_by_op[op_id] = row

    out: Dict[str, Tuple[str, str]] = {}
    for cur in cur_results:
        op_id = str((cur or {}).get("operation_id") or "")
        if not op_id:
            continue
        cur_group = _group(cur.get("category"))
        cur_fp = str(cur.get("fingerprint") or "")
        prev: Optional[Dict[str, Any]] = prev_by_op.get(op_id)

        if prev is None:
            out[op_id] = ("new_endpoint", f"новый эндпоинт в прогоне: {cur.get('category')} {cur.get('http_status') or ''}".strip())
            continue

        prev_group = _group(prev.get("category"))
        prev_fp = str(prev.get("fingerprint") or "")

        if cur_group == OK:
            if prev_group == OK:
                out[op_id] = (OK, "")
            elif prev_group == "error":
                out[op_id] = ("fixed", f"было: {prev.get('category')} {prev.get('http_status') or ''}".strip())
            else:
                out[op_id] = ("domain_fixed", "была доменная ошибка (LLM-конверт)")
            continue

        if cur_group == DOMAIN:
            if prev_group == DOMAIN:
                note = "" if cur_fp and cur_fp == prev_fp else "fingerprint changed"
                out[op_id] = ("still_domain_error", note)
            elif prev_group == "error":
                out[op_id] = ("new_domain_error", f"раньше была HTTP-ошибка: {prev.get('category')} {prev.get('http_status') or ''}".strip())
            else:
                out[op_id] = ("new_domain_error", "")
            continue

        # cur_group == "error"
        if prev_group == "error":
            note = "" if cur_fp and cur_fp == prev_fp else "fingerprint changed"
            out[op_id] = ("still_failing", note)
        elif prev_group == DOMAIN:
            out[op_id] = ("new_error", "раньше была доменная ошибка (LLM-конверт)")
        else:
            out[op_id] = ("new_error", f"было: ok {prev.get('http_status') or ''}".strip())
    return out


def diff_counters(diff_statuses: List[str]) -> Dict[str, int]:
    """Счётчики диффа для сводки прогона."""
    counters: Dict[str, int] = {}
    for status in diff_statuses:
        key = str(status or "")
        if not key:
            continue
        counters[key] = counters.get(key, 0) + 1
    return counters
