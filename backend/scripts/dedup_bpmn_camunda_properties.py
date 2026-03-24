#!/usr/bin/env python3
"""
dedup_bpmn_camunda_properties.py
---------------------------------
Finds sessions whose bpmn_xml contains duplicate <camunda:property> or
<zeebe:property> entries (same name, case-insensitive) within any properties
block and removes the duplicates in-place, keeping only the FIRST occurrence.

Root cause: a hydration bug caused properties to multiply on each
setDraftPersisted cycle; when the user saved, the bloated XML was written to the
bpmn_xml column, making the session response 8 MB+ and load time 30+ seconds.

Usage (inside Docker container or locally):
    python backend/scripts/dedup_bpmn_camunda_properties.py [--session SESSION_ID] [--dry-run]

Options:
    --session SESSION_ID   Target a single session (default: scan all sessions).
    --dry-run              Print stats without writing changes back to the DB.
    --min-size-kb INT      Only process sessions whose bpmn_xml exceeds this size
                           in KB (default: 100).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Optional

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import storage  # noqa: E402


# ---------------------------------------------------------------------------
# XML dedup logic — regex-based to avoid adding lxml/ElementTree namespace deps
# ---------------------------------------------------------------------------

# Matches a single <camunda:property .../> or <zeebe:property .../> tag.
_PROP_RE = re.compile(
    r'<(camunda|zeebe):property\s[^>]*/?>',
    re.IGNORECASE,
)

_NAME_ATTR_RE = re.compile(r'\bname=["\']([^"\']*)["\']', re.IGNORECASE)


def _dedup_properties_block(block_xml: str) -> tuple[str, int]:
    """Remove duplicate property entries within one properties block.
    Returns (cleaned_block_xml, removed_count)."""
    seen: set[str] = set()
    removed = 0

    def _replace(m: re.Match) -> str:
        nonlocal removed
        tag = m.group(0)
        name_m = _NAME_ATTR_RE.search(tag)
        if not name_m:
            return tag
        key = name_m.group(1).strip().lower()
        if not key:
            return tag
        if key in seen:
            removed += 1
            return ""
        seen.add(key)
        return tag

    cleaned = _PROP_RE.sub(_replace, block_xml)
    return cleaned, removed


# Matches both <camunda:properties>...</camunda:properties> and <zeebe:properties>...
_PROPERTIES_BLOCK_RE = re.compile(
    r'<(camunda|zeebe):properties>(.*?)</(camunda|zeebe):properties>',
    re.IGNORECASE | re.DOTALL,
)


def dedup_bpmn_xml(xml: str) -> tuple[str, int]:
    """Process all camunda/zeebe:properties blocks in xml.
    Returns (cleaned_xml, total_removed_count)."""
    total_removed = 0

    def _replace_block(m: re.Match) -> str:
        nonlocal total_removed
        ns = m.group(1)
        inner = m.group(2)
        cleaned_inner, removed = _dedup_properties_block(inner)
        total_removed += removed
        return f"<{ns}:properties>{cleaned_inner}</{ns}:properties>"

    cleaned_xml = _PROPERTIES_BLOCK_RE.sub(_replace_block, xml)
    return cleaned_xml, total_removed


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _get_db_path() -> Path:
    # Use the same path resolution as storage.py
    db_path_fn = getattr(storage, "_db_path", None)
    if callable(db_path_fn):
        return Path(db_path_fn())
    raise RuntimeError("Cannot resolve SQLite DB path from storage module.")


def _iter_sessions(session_id: Optional[str] = None):
    """Yield (id, bpmn_xml) tuples from the sessions table."""
    import sqlite3

    db_path = _get_db_path()
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    try:
        if session_id:
            rows = con.execute(
                "SELECT id, bpmn_xml FROM sessions WHERE id = ?", [session_id]
            ).fetchall()
        else:
            rows = con.execute("SELECT id, bpmn_xml FROM sessions").fetchall()
        for row in rows:
            yield str(row["id"]), str(row["bpmn_xml"] or "")
    finally:
        con.close()


def _update_bpmn_xml(session_id: str, new_xml: str) -> None:
    import sqlite3

    db_path = _get_db_path()
    con = sqlite3.connect(str(db_path))
    try:
        con.execute(
            "UPDATE sessions SET bpmn_xml = ? WHERE id = ?",
            [new_xml, session_id],
        )
        con.commit()
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Deduplicate camunda:property entries in stored bpmn_xml")
    parser.add_argument("--session", default=None, help="Target a single session ID")
    parser.add_argument("--dry-run", action="store_true", help="Print stats only, no DB writes")
    parser.add_argument("--min-size-kb", type=int, default=100, help="Skip sessions smaller than N KB (default 100)")
    args = parser.parse_args()

    min_bytes = args.min_size_kb * 1024

    processed = 0
    cleaned = 0
    total_removed = 0

    for sid, xml in _iter_sessions(session_id=args.session):
        size_kb = len(xml.encode()) // 1024
        if len(xml.encode()) < min_bytes and not args.session:
            continue  # skip small sessions unless explicitly targeted
        processed += 1

        new_xml, removed = dedup_bpmn_xml(xml)
        if removed == 0:
            print(f"  {sid}  {size_kb} KB  — no duplicates found")
            continue

        cleaned += 1
        total_removed += removed
        new_size_kb = len(new_xml.encode()) // 1024
        print(f"  {sid}  {size_kb} KB → {new_size_kb} KB  removed {removed} duplicate properties", end="")

        if args.dry_run:
            print("  [DRY RUN — not written]")
        else:
            _update_bpmn_xml(sid, new_xml)
            print("  [SAVED]")

    print()
    print(f"Scanned: {processed}  Cleaned: {cleaned}  Total props removed: {total_removed}")
    if args.dry_run:
        print("DRY RUN — no changes written to DB.")


if __name__ == "__main__":
    main()
