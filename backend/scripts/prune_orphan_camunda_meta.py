#!/usr/bin/env python3
"""Prune orphan camunda extension entries from sessions.bpmn_meta_json.

Background: bpmn_meta_json["camunda_extensions_by_element_id"] must mirror the
session's current bpmn_xml. Older revisions left orphan keys (element ids that
no longer exist in the XML) and stale property sets in meta, which then surface
as rows with empty element type/name in the analytics properties export.

This script scans sessions, reports per session what WOULD be deleted
(orphan keys + property-set mismatches) and only updates the database when
called with --apply. Dry-run is the default mode.

Usage:
    python scripts/prune_orphan_camunda_meta.py                # dry-run
    python scripts/prune_orphan_camunda_meta.py --apply        # apply updates
    python scripts/prune_orphan_camunda_meta.py --session-id <id> [--apply]
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import _legacy_main, storage  # noqa: E402
from app.camunda_meta_utils import extract_camunda_extensions_from_bpmn_xml  # noqa: E402

SAMPLE_KEYS_LIMIT = 10


@dataclass
class SessionPruneResult:
    session_id: str = ""
    changed: bool = False
    orphan_keys: List[str] = field(default_factory=list)
    mismatched_keys: List[str] = field(default_factory=list)
    kept_keys: int = 0
    parse_error: bool = False


def _to_text(value: Any) -> str:
    return str(value or "").strip()


def _build_where(session_ids: Sequence[str]) -> tuple:
    cleaned = [sid for sid in (_to_text(item) for item in session_ids) if sid]
    if not cleaned:
        return "", []
    placeholders = ",".join(["?"] * len(cleaned))
    return f"WHERE id IN ({placeholders})", cleaned


def _diff_camunda_map(
    existing_map: Any,
    fresh_map: Dict[str, Any],
    *,
    xml_element_ids: set,
) -> tuple:
    """Split existing camunda map keys into orphan / mismatched / kept."""
    if not isinstance(existing_map, dict):
        return [], [], 0
    orphan_keys: List[str] = []
    mismatched_keys: List[str] = []
    kept = 0
    for key_raw, value_raw in existing_map.items():
        key = _to_text(key_raw)
        if not key:
            continue
        if key not in xml_element_ids:
            orphan_keys.append(key)
            continue
        fresh_value = fresh_map.get(key)
        try:
            same = json.dumps(value_raw, sort_keys=True, ensure_ascii=False) == json.dumps(
                fresh_value, sort_keys=True, ensure_ascii=False
            )
        except Exception:
            same = False
        if same:
            kept += 1
        else:
            mismatched_keys.append(key)
    return orphan_keys, mismatched_keys, kept


def prune_orphan_camunda_meta(
    *,
    apply_changes: bool = False,
    session_ids: Optional[Sequence[str]] = None,
    limit: int = 0,
) -> Dict[str, Any]:
    session_ids = list(session_ids or [])
    storage._ensure_schema()
    where_sql, where_params = _build_where(session_ids)
    limit_sql = f" LIMIT {int(limit)}" if int(limit or 0) > 0 else ""

    with storage._connect() as con:
        rows = con.execute(
            f"SELECT id, bpmn_xml, bpmn_meta_json, version, updated_at FROM sessions {where_sql} ORDER BY id{limit_sql}",
            where_params,
        ).fetchall()

        per_session: List[SessionPruneResult] = []
        changed_count = 0
        updated_at = int(datetime.now(timezone.utc).timestamp())

        for row in rows:
            session_id = _to_text(row["id"])
            xml = str(row["bpmn_xml"] or "")
            meta_raw = storage._json_loads(row["bpmn_meta_json"], {})
            existing_map = meta_raw.get("camunda_extensions_by_element_id") if isinstance(meta_raw, dict) else None
            if not isinstance(existing_map, dict) or not existing_map:
                per_session.append(SessionPruneResult(session_id=session_id))
                continue

            result = SessionPruneResult(session_id=session_id)
            fresh_map: Dict[str, Any] = {}
            xml_element_ids = set()
            if xml.strip():
                try:
                    import xml.etree.ElementTree as ET

                    root = ET.fromstring(xml)
                    for elem in root.iter():
                        eid = _to_text(elem.get("id"))
                        if eid:
                            xml_element_ids.add(eid)
                    fresh_map = extract_camunda_extensions_from_bpmn_xml(xml) or {}
                except Exception:
                    result.parse_error = True
                    per_session.append(result)
                    continue

            orphan_keys, mismatched_keys, kept = _diff_camunda_map(
                existing_map, fresh_map, xml_element_ids=xml_element_ids
            )
            result.orphan_keys = orphan_keys
            result.mismatched_keys = mismatched_keys
            result.kept_keys = kept
            result.changed = bool(orphan_keys or mismatched_keys)
            if result.changed:
                next_meta = _legacy_main._normalize_bpmn_meta(meta_raw)
                next_meta.pop("camunda_extensions_by_element_id", None)
                if xml.strip():
                    next_meta["camunda_extensions_by_element_id"] = fresh_map
                if apply_changes:
                    con.execute(
                        "UPDATE sessions SET bpmn_meta_json = ?, version = ?, updated_at = ? WHERE id = ?",
                        [
                            storage._json_dumps(next_meta, {}),
                            int(row["version"] or 0) + 1,
                            updated_at,
                            session_id,
                        ],
                    )
                    changed_count += 1
            per_session.append(result)

    return {
        "total_sessions_scanned": len(per_session),
        "sessions_with_meta": sum(1 for r in per_session if r.kept_keys or r.orphan_keys or r.mismatched_keys),
        "sessions_changed": sum(1 for r in per_session if r.changed),
        "sessions_applied": changed_count,
        "orphan_keys_total": sum(len(r.orphan_keys) for r in per_session),
        "mismatched_keys_total": sum(len(r.mismatched_keys) for r in per_session),
        "parse_errors": sum(1 for r in per_session if r.parse_error),
        "sessions": [
            {
                "session_id": r.session_id,
                "changed": r.changed,
                "orphan_keys": len(r.orphan_keys),
                "orphan_keys_sample": r.orphan_keys[:SAMPLE_KEYS_LIMIT],
                "mismatched_keys": len(r.mismatched_keys),
                "mismatched_keys_sample": r.mismatched_keys[:SAMPLE_KEYS_LIMIT],
                "kept_keys": r.kept_keys,
                "parse_error": r.parse_error,
            }
            for r in per_session
        ],
    }


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="apply updates (default: dry-run)")
    parser.add_argument("--session-id", action="append", default=[], help="restrict to session id(s)")
    parser.add_argument("--limit", type=int, default=0, help="limit scanned sessions (0 = all)")
    parser.add_argument("--json", action="store_true", help="print full JSON report")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _build_parser().parse_args(argv)
    summary = prune_orphan_camunda_meta(
        apply_changes=bool(args.apply),
        session_ids=args.session_id,
        limit=max(0, int(args.limit or 0)),
    )
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"[camunda-prune] mode={mode}")
    print(
        "[camunda-prune] "
        f"sessions_scanned={summary['total_sessions_scanned']} "
        f"sessions_with_orphans_or_mismatch={summary['sessions_changed']} "
        f"sessions_updated={summary['sessions_applied']} "
        f"orphan_keys={summary['orphan_keys_total']} "
        f"mismatched_keys={summary['mismatched_keys_total']} "
        f"parse_errors={summary['parse_errors']}"
    )
    changed_preview = [row for row in summary["sessions"] if row.get("changed")]
    if changed_preview:
        print("[camunda-prune] affected sessions:")
        for item in changed_preview[:50]:
            print(
                "  - "
                f"{item['session_id']}: "
                f"orphan={item['orphan_keys']} {item['orphan_keys_sample']}, "
                f"mismatch={item['mismatched_keys']} {item['mismatched_keys_sample']}, "
                f"kept={item['kept_keys']}"
            )
    if not args.apply and summary["sessions_changed"]:
        print("[camunda-prune] dry-run only; re-run with --apply to update sessions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
