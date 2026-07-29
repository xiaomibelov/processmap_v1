"""E9.3/E9.5 — критерии выхода из пилота и расчёт прогресса.

pilot_exit_criteria_json = {
    "min_orders": 20,             # минимум заказов за пилот
    "max_critical_errors": 0,     # максимум критических ошибок
    "max_defect_rate_pct": 2.0,   # максимум брака, %
}

Правила валидации (E9.3):
  * все значения неотрицательные;
  * хотя бы один критерий обязателен;
  * неизвестные ключи отклоняются.

Прогресс (E9.4): агрегат pilot_metric_sample против критериев.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

CRITERION_KEYS = ("min_orders", "max_critical_errors", "max_defect_rate_pct")


class CriteriaError(ValueError):
    """Ошибка валидации критериев → HTTP 422."""


def validate_criteria(raw: Any) -> Dict[str, float]:
    if not isinstance(raw, dict):
        raise CriteriaError("criteria должен быть объектом {min_orders, max_critical_errors, max_defect_rate_pct}")
    unknown = sorted(set(raw.keys()) - set(CRITERION_KEYS))
    if unknown:
        raise CriteriaError(f"неизвестные критерии: {', '.join(unknown)}")
    out: Dict[str, float] = {}
    for key in CRITERION_KEYS:
        if key not in raw or raw[key] is None:
            continue
        value = raw[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise CriteriaError(f"{key} должен быть неотрицательным числом")
        num = float(value)
        if num < 0:
            raise CriteriaError(f"{key} должен быть неотрицательным числом")
        out[key] = int(value) if key != "max_defect_rate_pct" and float(value).is_integer() else num
    if not out:
        raise CriteriaError("нужен хотя бы один критерий выхода из пилота")
    return out


def _fmt_num(value: float) -> str:
    num = float(value)
    return str(int(num)) if num.is_integer() else f"{num:g}"


def compute_progress(
    criteria: Optional[Dict[str, Any]],
    totals: Dict[str, Any],
) -> Dict[str, Any]:
    """Агрегат vs критерии → checks + unmet-причины (на русском, для 409/tooltip)."""
    crit = validate_criteria(criteria or {}) if criteria else {}
    orders = int(totals.get("orders") or 0)
    critical = int(totals.get("critical_errors") or 0)
    defects = int(totals.get("defect_count") or 0)
    defect_rate = round((defects / orders * 100.0) if orders > 0 else 0.0, 2)

    checks: List[Dict[str, Any]] = []
    unmet: List[str] = []

    if "min_orders" in crit:
        target = crit["min_orders"]
        met = orders >= target
        checks.append({
            "key": "min_orders", "label": "Заказы",
            "current": orders, "target": target, "met": met,
            "text": f"{orders}/{_fmt_num(target)}",
        })
        if not met:
            unmet.append(f"min_orders не выполнен: {orders}/{_fmt_num(target)}")

    if "max_critical_errors" in crit:
        target = crit["max_critical_errors"]
        met = critical <= target
        checks.append({
            "key": "max_critical_errors", "label": "Критические ошибки",
            "current": critical, "target": target, "met": met,
            "text": f"{critical}/{_fmt_num(target)}",
        })
        if not met:
            unmet.append(f"max_critical_errors не выполнен: {critical}/{_fmt_num(target)}")

    if "max_defect_rate_pct" in crit:
        target = crit["max_defect_rate_pct"]
        met = defect_rate <= target
        checks.append({
            "key": "max_defect_rate_pct", "label": "Брак",
            "current": defect_rate, "target": target, "met": met,
            "text": f"{_fmt_num(defect_rate)}%/≤{_fmt_num(target)}%",
        })
        if not met:
            unmet.append(f"max_defect_rate_pct не выполнен: {_fmt_num(defect_rate)}%/≤{_fmt_num(target)}%")

    return {
        "criteria": crit,
        "totals": {
            "orders": orders,
            "critical_errors": critical,
            "defect_count": defects,
            "defect_rate_pct": defect_rate,
        },
        "checks": checks,
        "all_met": bool(checks) and all(c["met"] for c in checks),
        "unmet": unmet,
    }
