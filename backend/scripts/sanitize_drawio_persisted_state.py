#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import _legacy_main, storage  # noqa: E402


TECHNICAL_TAGS = {
    "defs",
    "clippath",
    "mask",
    "pattern",
    "lineargradient",
    "radialgradient",
    "marker",
    "filter",
    "style",
    "title",
    "desc",
    "metadata",
}

TECHNICAL_ID_PATTERNS = [
    re.compile(r"^mx(?:clip|marker|gradient|pattern|shadow|filter|mask|defs)[-_]", re.IGNORECASE),
    re.compile(r"^clip[-_]", re.IGNORECASE),
    re.compile(r"^mask[-_]", re.IGNORECASE),
    re.compile(r"^filter[-_]", re.IGNORECASE),
    re.compile(r"^gradient[-_]", re.IGNORECASE),
    re.compile(r"^pattern[-_]", re.IGNORECASE),
    re.compile(r"^arrow[-_]", re.IGNORECASE),
]

LEGACY_MASQUERADE_PREFIXES = (
    "Activity_",
    "Collaboration_",
    "Participant_",
    "Lane_",
    "Gateway_",
    "StartEvent_",
    "EndEvent_",
    "Event_",
    "Task_",
    "SubProcess_",
    "BoundaryEvent_",
    "SequenceFlow_",
    "MessageFlow_",
    "DataObject_",
    "DataObjectReference_",
    "Association_",
    "TextAnnotation_",
    "Group_",
)


@dataclass
class SessionSanitizeResult:
    session_id: str
    changed: bool
    before_rows: int
    after_rows: int
    dropped_unmanaged_ids: int
    dropped_technical_ids: int
    dropped_stale_ghost_ids: int
    dropped_invalid_legacy_masquerade_ids: int
    dropped_empty_id_rows: int
    dropped_duplicate_id_rows: int
    preserved_no_preview_ids: int
    has_preview: bool
    renderable_ids: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "changed": self.changed,
            "before_rows": self.before_rows,
            "after_rows": self.after_rows,
            "dropped_unmanaged_ids": self.dropped_unmanaged_ids,
            "dropped_technical_ids": self.dropped_technical_ids,
            "dropped_stale_ghost_ids": self.dropped_stale_ghost_ids,
            "dropped_invalid_legacy_masquerade_ids": self.dropped_invalid_legacy_masquerade_ids,
            "dropped_empty_id_rows": self.dropped_empty_id_rows,
            "dropped_duplicate_id_rows": self.dropped_duplicate_id_rows,
            "preserved_no_preview_ids": self.preserved_no_preview_ids,
            "has_preview": self.has_preview,
            "renderable_ids": self.renderable_ids,
        }


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _to_text(value: Any) -> str:
    return str(value or "").strip()


def _is_technical_id(element_id: str) -> bool:
    src = _to_text(element_id)
    if not src:
        return False
    return any(pattern.search(src) for pattern in TECHNICAL_ID_PATTERNS)


def _looks_like_legacy_masquerade(element_id: str) -> bool:
    src = _to_text(element_id)
    if not src:
        return False
    return src.startswith(LEGACY_MASQUERADE_PREFIXES)


def _sanitize_svg(svg_raw: Any) -> str:
    src = _to_text(svg_raw)
    if not src:
        return ""
    src = re.sub(r"<script[\s\S]*?</script>", "", src, flags=re.IGNORECASE)
    src = re.sub(r"\son[a-z]+\s*=\s*(['\"]).*?\1", "", src, flags=re.IGNORECASE)
    src = re.sub(r"\son[a-z]+\s*=\s*[^\s>]+", "", src, flags=re.IGNORECASE)
    return src


def extract_svg_ids(svg_raw: Any, *, include_technical: bool = False) -> Set[str]:
    body = _sanitize_svg(svg_raw)
    if not body:
        return set()
    out: Set[str] = set()
    re_id = re.compile(
        r"<([a-zA-Z][a-zA-Z0-9:_-]*)([^>]*?)\sid\s*=\s*(\"([^\"]+)\"|'([^']+)')([^>]*)>",
        flags=re.IGNORECASE,
    )
    for match in re_id.finditer(body):
        tag_name = _to_text(match.group(1)).lower()
        element_id = _to_text(match.group(4) or match.group(5))
        if not element_id:
            continue
        if not include_technical:
            if tag_name in TECHNICAL_TAGS:
                continue
            if _is_technical_id(element_id):
                continue
        out.add(element_id)
    return out


def sanitize_drawio_meta(drawio_raw: Any) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    normalized = _legacy_main._normalize_drawio_meta(drawio_raw)
    rows_raw = _as_list(normalized.get("drawio_elements_v1"))
    svg_cache = _to_text(normalized.get("svg_cache"))
    renderable_ids = extract_svg_ids(svg_cache, include_technical=False)
    has_preview = bool(svg_cache)

    kept_rows: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    counters = {
        "dropped_unmanaged_ids": 0,
        "dropped_technical_ids": 0,
        "dropped_stale_ghost_ids": 0,
        "dropped_invalid_legacy_masquerade_ids": 0,
        "dropped_empty_id_rows": 0,
        "dropped_duplicate_id_rows": 0,
        "preserved_no_preview_ids": 0,
    }
    changed = False

    for row_raw in rows_raw:
        row = _as_dict(row_raw)
        element_id = _to_text(row.get("id"))
        if not element_id:
            counters["dropped_empty_id_rows"] += 1
            changed = True
            continue
        if element_id in seen_ids:
            counters["dropped_duplicate_id_rows"] += 1
            changed = True
            continue
        seen_ids.add(element_id)

        if _is_technical_id(element_id):
            counters["dropped_technical_ids"] += 1
            changed = True
            continue

        if has_preview:
            if element_id not in renderable_ids:
                if bool(row.get("deleted")):
                    counters["dropped_stale_ghost_ids"] += 1
                else:
                    counters["dropped_unmanaged_ids"] += 1
                if _looks_like_legacy_masquerade(element_id):
                    counters["dropped_invalid_legacy_masquerade_ids"] += 1
                changed = True
                continue
        else:
            counters["preserved_no_preview_ids"] += 1

        kept_rows.append(row)

    if changed:
        normalized = {
            **normalized,
            "drawio_elements_v1": kept_rows,
        }

    stats = {
        "changed": changed,
        "before_rows": len(rows_raw),
        "after_rows": len(kept_rows),
        "has_preview": has_preview,
        "renderable_ids": len(renderable_ids),
        **counters,
    }
    return normalized, stats


def _build_where(session_ids: Sequence[str]) -> Tuple[str, List[Any]]:
    cleaned = [sid for sid in (_to_text(item) for item in session_ids) if sid]
    if not cleaned:
        return "", []
    placeholders = ",".join(["?"] * len(cleaned))
    return f"WHERE id IN ({placeholders})", cleaned


def sanitize_sessions(
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
            f"SELECT id, bpmn_meta_json, version, updated_at FROM sessions {where_sql} ORDER BY id{limit_sql}",
            where_params,
        ).fetchall()

        per_session: List[SessionSanitizeResult] = []
        changed_count = 0
        updated_at = int(datetime.now(timezone.utc).timestamp())

        for row in rows:
            session_id = _to_text(row["id"])
            meta_raw = storage._json_loads(row["bpmn_meta_json"], {})
            normalized_meta = _legacy_main._normalize_bpmn_meta(meta_raw)
            drawio_raw = _as_dict(normalized_meta.get("drawio"))
            sanitized_drawio, stats = sanitize_drawio_meta(drawio_raw)

            next_meta = normalized_meta
            changed = bool(stats["changed"])
            if changed:
                next_meta = dict(normalized_meta)
                next_meta["drawio"] = sanitized_drawio
                next_meta = _legacy_main._normalize_bpmn_meta(next_meta)
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

            per_session.append(
                SessionSanitizeResult(
                    session_id=session_id,
                    changed=changed,
                    before_rows=int(stats["before_rows"]),
                    after_rows=int(stats["after_rows"]),
                    dropped_unmanaged_ids=int(stats["dropped_unmanaged_ids"]),
                    dropped_technical_ids=int(stats["dropped_technical_ids"]),
                    dropped_stale_ghost_ids=int(stats["dropped_stale_ghost_ids"]),
                    dropped_invalid_legacy_masquerade_ids=int(stats["dropped_invalid_legacy_masquerade_ids"]),
                    dropped_empty_id_rows=int(stats["dropped_empty_id_rows"]),
                    dropped_duplicate_id_rows=int(stats["dropped_duplicate_id_rows"]),
                    preserved_no_preview_ids=int(stats["preserved_no_preview_ids"]),
                    has_preview=bool(stats["has_preview"]),
                    renderable_ids=int(stats["renderable_ids"]),
                )
            )

        if apply_changes:
            con.commit()

    summary = {
        "apply": bool(apply_changes),
        "total_sessions_scanned": len(per_session),
        "sessions_changed": changed_count if apply_changes else sum(1 for item in per_session if item.changed),
        "rows_before_total": sum(item.before_rows for item in per_session),
        "rows_after_total": sum(item.after_rows for item in per_session),
        "dropped_unmanaged_ids_total": sum(item.dropped_unmanaged_ids for item in per_session),
        "dropped_technical_ids_total": sum(item.dropped_technical_ids for item in per_session),
        "dropped_stale_ghost_ids_total": sum(item.dropped_stale_ghost_ids for item in per_session),
        "dropped_invalid_legacy_masquerade_ids_total": sum(
            item.dropped_invalid_legacy_masquerade_ids for item in per_session
        ),
        "dropped_empty_id_rows_total": sum(item.dropped_empty_id_rows for item in per_session),
        "dropped_duplicate_id_rows_total": sum(item.dropped_duplicate_id_rows for item in per_session),
        "preserved_no_preview_ids_total": sum(item.preserved_no_preview_ids for item in per_session),
        "sessions": [item.to_dict() for item in per_session],
    }
    return summary


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "One-shot sanitize/reconcile for persisted sessions.bpmn_meta_json drawio.drawio_elements_v1. "
            "Default mode is dry-run; pass --apply to persist changes."
        )
    )
    parser.add_argument(
        "--session-id",
        action="append",
        default=[],
        help="Optional specific session id (repeatable). If omitted, scans all sessions.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional scan limit after filtering (0 means no limit).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist sanitized bpmn_meta_json back into DB.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON summary.",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _build_parser().parse_args(argv)
    summary = sanitize_sessions(
        apply_changes=bool(args.apply),
        session_ids=args.session_id,
        limit=max(0, int(args.limit or 0)),
    )
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"[drawio-sanitize] mode={mode}")
    print(
        "[drawio-sanitize] "
        f"sessions_scanned={summary['total_sessions_scanned']} "
        f"sessions_changed={summary['sessions_changed']} "
        f"rows_before={summary['rows_before_total']} "
        f"rows_after={summary['rows_after_total']}"
    )
    print(
        "[drawio-sanitize] "
        f"dropped unmanaged={summary['dropped_unmanaged_ids_total']} "
        f"technical={summary['dropped_technical_ids_total']} "
        f"stale_ghost={summary['dropped_stale_ghost_ids_total']} "
        f"legacy_masquerade={summary['dropped_invalid_legacy_masquerade_ids_total']} "
        f"empty_id={summary['dropped_empty_id_rows_total']} "
        f"duplicate={summary['dropped_duplicate_id_rows_total']} "
        f"preserved_no_preview={summary['preserved_no_preview_ids_total']}"
    )
    changed_preview = [row for row in summary["sessions"] if row.get("changed")]
    if changed_preview:
        print("[drawio-sanitize] changed sessions:")
        for item in changed_preview[:30]:
            print(
                "  - "
                f"{item['session_id']}: "
                f"{item['before_rows']} -> {item['after_rows']}, "
                f"drop unmanaged={item['dropped_unmanaged_ids']}, "
                f"technical={item['dropped_technical_ids']}, "
                f"stale_ghost={item['dropped_stale_ghost_ids']}, "
                f"legacy={item['dropped_invalid_legacy_masquerade_ids']}, "
                f"empty={item['dropped_empty_id_rows']}, "
                f"duplicate={item['dropped_duplicate_id_rows']}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
