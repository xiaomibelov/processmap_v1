"""E6.4 — feasibility pre-check: ui_model × реестр кухонь.

Логика: объединение resource_requirements всех operation_code шаблона
(из каталога БД) сверяется с типами оборудования кухни и capabilities_json
(Asset Registry v1 — свободный JSON, контракт словаря появится позже, см.
backend/app/kitchens/repository.py).

Требование считается покрытым, если:
  - equipment_type_id присутствует на кухне, ИЛИ
  - само требование названо как capability и она есть, ИЛИ
  - у требования есть capability-алиас (CAPABILITY_ALIASES) и эта capability
    есть у какого-либо оборудования кухни
    (напр. measure_temperature требует equipment 'temperature_sensor' ИЛИ
    capability 'temperature_measurement').

Режимы (locked decision): mode='warning' (default) → непокрытые требования
дают verdict 'warning'; mode='strict' → 'blocked' (E7 будет блокировать
publish в strict).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# equipment_type -> capability, которая может его заменить.
CAPABILITY_ALIASES = {
    "temperature_sensor": "temperature_measurement",
}

_VERDICT_BY_MODE = {"strict": "blocked", "warning": "warning"}


def _kitchen_capabilities(kitchen: Dict[str, Any]) -> set:
    caps = set()
    for item in kitchen.get("equipment") or []:
        caps_json = (item or {}).get("capabilities_json") or {}
        for cap in caps_json.get("capabilities") or []:
            caps.add(str(cap))
    return caps


def _kitchen_equipment_types(kitchen: Dict[str, Any]) -> set:
    return {
        str((item or {}).get("equipment_type_id") or "")
        for item in kitchen.get("equipment") or []
        if str((item or {}).get("equipment_type_id") or "")
    }


def collect_required_equipment(ui_model: Dict[str, Any], catalog: Dict[str, Dict[str, Any]]) -> Dict[str, List[str]]:
    """Union resource_requirements.equipment по всем operation_code шаблона.

    Возвращает {operation_code: sorted equipment list} только для операций,
    у которых есть требования; неизвестные коды пропускаются (их ловит R1).
    """
    required: Dict[str, set] = {}
    for node in (ui_model or {}).get("nodes") or []:
        if not isinstance(node, dict):
            continue
        op_code = str(node.get("operation_code") or "").strip()
        if not op_code or op_code not in catalog:
            continue
        reqs = (catalog.get(op_code) or {}).get("resource_requirements") or {}
        for eq in reqs.get("equipment") or []:
            required.setdefault(op_code, set()).add(str(eq))
    return {op: sorted(eqs) for op, eqs in required.items() if eqs}


def precheck_kitchen(
    required: Dict[str, List[str]],
    kitchen: Dict[str, Any],
    *,
    mode: str = "warning",
) -> Dict[str, Any]:
    """Verdict одной кухни: {kitchen_id, name, verdict, unmet: [...]}."""
    equipment_types = _kitchen_equipment_types(kitchen)
    capabilities = _kitchen_capabilities(kitchen)
    unmet: List[Dict[str, str]] = []
    for op_code in sorted(required.keys()):
        for requirement in required[op_code]:
            if requirement in equipment_types or requirement in capabilities:
                continue
            alias = CAPABILITY_ALIASES.get(requirement)
            if alias and alias in capabilities:
                continue
            if alias:
                detail = (
                    f"Операция '{op_code}' требует оборудование '{requirement}' "
                    f"(или capability '{alias}') — отсутствует на кухне"
                )
            else:
                detail = (
                    f"Операция '{op_code}' требует оборудование '{requirement}' — "
                    f"отсутствует на кухне"
                )
            unmet.append(
                {
                    "operation_code": op_code,
                    "requirement": requirement,
                    "detail_ru": detail,
                }
            )
    verdict = "ok" if not unmet else _VERDICT_BY_MODE.get(mode, "warning")
    return {
        "kitchen_id": str(kitchen.get("id") or ""),
        "name": str(kitchen.get("name") or ""),
        "verdict": verdict,
        "unmet": unmet,
    }


def precheck_ui_model(
    ui_model: Dict[str, Any],
    kitchens: List[Dict[str, Any]],
    *,
    catalog: Dict[str, Dict[str, Any]],
    mode: str = "warning",
) -> Dict[str, Any]:
    """Pre-check шаблона против списка кухонь.

    mode: 'warning' (default) | 'strict'.
    """
    if mode not in _VERDICT_BY_MODE:
        raise ValueError(f"unsupported precheck mode: {mode!r}")
    required = collect_required_equipment(ui_model, catalog)
    results = [precheck_kitchen(required, kitchen, mode=mode) for kitchen in kitchens]
    return {
        "mode": mode,
        "summary": {
            "kitchens": len(results),
            "ok": sum(1 for r in results if r["verdict"] == "ok"),
            "warning": sum(1 for r in results if r["verdict"] == "warning"),
            "blocked": sum(1 for r in results if r["verdict"] == "blocked"),
        },
        "required_equipment": [
            {"operation_code": op, "equipment": eqs} for op, eqs in sorted(required.items())
        ],
        "kitchens": results,
    }


def precheck_with_catalog(
    ui_model: Dict[str, Any],
    kitchens: List[Dict[str, Any]],
    *,
    mode: str = "warning",
) -> Dict[str, Any]:
    """Pre-check с каталогом из БД (используется endpoint'ами E6.4)."""
    from .service import load_catalog_from_db

    return precheck_ui_model(ui_model, kitchens, catalog=load_catalog_from_db(), mode=mode)
