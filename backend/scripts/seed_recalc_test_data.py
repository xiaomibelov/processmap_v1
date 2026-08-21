#!/usr/bin/env python3
"""Seed a session with random ee_time/ingredient_value Camunda properties.

Usage examples:
    # SQLite (local dev)
    FPC_DB_BACKEND=sqlite PROCESS_DB_PATH=./processmap.sqlite3 \
        python backend/scripts/seed_recalc_test_data.py <session_id>

    # PostgreSQL (stage / prod)
    DATABASE_URL=postgresql://... \
        python backend/scripts/seed_recalc_test_data.py <session_id>
"""

from __future__ import annotations

import argparse
import os
import random
import sys
from typing import Any, Dict


def _ensure_backend_path() -> None:
    backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if backend_root not in sys.path:
        sys.path.insert(0, backend_root)


def _build_random_element(element_id: str) -> Dict[str, Any]:
    """Return a Camunda extension element with ee_time and ingredient_value."""
    ee_time = round(random.uniform(0.1, 120.0), 2)
    ingredient_value = round(random.uniform(0.1, 50.0), 2)
    return {
        "properties": {
            "extensionProperties": [
                {"name": "ee_time", "value": str(ee_time)},
                {"name": "ingredient_value", "value": str(ingredient_value)},
            ]
        }
    }


def seed_session(session_id: str, count: int = 100, org_id: str = "") -> None:
    from app.db.config import get_db_runtime_config
    from app.storage import get_storage

    get_db_runtime_config.cache_clear()
    storage = get_storage()

    session = storage.load(session_id, org_id=org_id or None, is_admin=True)
    if session is None:
        raise SystemExit(f"Session not found: {session_id}")

    meta = dict(session.bpmn_meta or {})
    camunda_map = meta.setdefault("camunda_extensions_by_element_id", {})
    if not isinstance(camunda_map, dict):
        camunda_map = {}
        meta["camunda_extensions_by_element_id"] = camunda_map

    existing_test_keys = [k for k in camunda_map.keys() if k.startswith("TestOp_")]
    if existing_test_keys:
        print(f"Removing {len(existing_test_keys)} existing TestOp_* entries first...")
        for key in existing_test_keys:
            camunda_map.pop(key, None)

    print(f"Adding {count} random TestOp_* elements to session {session_id}...")
    for i in range(count):
        element_id = f"TestOp_{i:03d}"
        camunda_map[element_id] = _build_random_element(element_id)

    updated = storage.patch_session_meta(
        session_id,
        bpmn_meta=meta,
        base_diagram_state_version=session.diagram_state_version,
        user_id=session.owner_user_id,
        org_id=session.org_id,
        is_admin=True,
    )
    if updated is None:
        raise SystemExit("Failed to patch session meta (CAS mismatch or not found).")

    print(f"Done. Session diagram_state_version is now {updated.diagram_state_version}.")


def main() -> None:
    _ensure_backend_path()

    parser = argparse.ArgumentParser(description="Seed random recalc test properties into a session.")
    parser.add_argument("session_id", help="Session UUID to populate.")
    parser.add_argument("--count", type=int, default=100, help="Number of random elements to create (default: 100).")
    parser.add_argument("--org-id", default=os.environ.get("FPC_ORG_ID", ""), help="Organization ID (optional).")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility (default: 42).")
    args = parser.parse_args()

    random.seed(args.seed)
    seed_session(args.session_id, count=args.count, org_id=args.org_id)


if __name__ == "__main__":
    main()
