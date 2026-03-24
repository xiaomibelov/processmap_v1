#!/usr/bin/env python3
"""
dedup_bpmn_properties_pg.py
---------------------------
Finds sessions whose bpmn_xml contains duplicate <camunda:property> or
<zeebe:property> entries (same name, case-insensitive) within any properties
block and removes the duplicates in-place, keeping only the FIRST occurrence.

Root cause: a hydration bug caused properties to multiply on each save cycle;
the bloated XML makes sessions 8 MB+ and load time 30+ seconds.

Usage (inside Docker container or locally with DB access):
    python backend/scripts/dedup_bpmn_properties_pg.py [--session SESSION_ID] [--dry-run]

Options:
    --session SESSION_ID   Target a single session (default: scan all).
    --dry-run              Print stats without writing changes back to the DB.
    --min-size-kb INT      Only process sessions whose bpmn_xml exceeds this
                           size in KB (default: 50).
    --threshold INT        Only clean blocks with more than this many duplicate
                           entries (default: 3).

Environment variables (override defaults):
    DATABASE_URL           PostgreSQL DSN, e.g.
                           postgresql://fpc:fpc@localhost:5432/processmap
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from typing import Optional

# ---------------------------------------------------------------------------
# XML dedup logic
# ---------------------------------------------------------------------------

_PROP_RE = re.compile(
    r'<(camunda|zeebe):property\s[^>]*/?>',
    re.IGNORECASE,
)
_NAME_ATTR_RE = re.compile(r'\bname=["\']([^"\']*)["\']', re.IGNORECASE)
_PROPERTIES_BLOCK_RE = re.compile(
    r'<(camunda|zeebe):properties>(.*?)</(camunda|zeebe):properties>',
    re.IGNORECASE | re.DOTALL,
)


def _dedup_properties_block(block_xml: str, threshold: int = 3) -> tuple:
    """Remove duplicate property entries within one block.
    Returns (cleaned_block_xml, removed_count).
    Skips blocks with <= threshold properties (already clean).
    """
    prop_count = len(_PROP_RE.findall(block_xml))
    if prop_count <= threshold:
        return block_xml, 0

    seen: set = set()
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


def dedup_bpmn_xml(xml: str, threshold: int = 3) -> tuple:
    """Process all camunda/zeebe:properties blocks in xml.
    Returns (cleaned_xml, total_removed_count).
    """
    total_removed = 0

    def _replace_block(m: re.Match) -> str:
        nonlocal total_removed
        ns = m.group(1)
        inner = m.group(2)
        cleaned_inner, removed = _dedup_properties_block(inner, threshold)
        total_removed += removed
        return f"<{ns}:properties>{cleaned_inner}</{ns}:properties>"

    cleaned_xml = _PROPERTIES_BLOCK_RE.sub(_replace_block, xml)
    return cleaned_xml, total_removed


# ---------------------------------------------------------------------------
# DB helpers (PostgreSQL via psycopg2)
# ---------------------------------------------------------------------------

_DEFAULT_DSN = "postgresql://fpc:fpc@localhost:5432/processmap"


def _get_dsn() -> str:
    return os.environ.get("DATABASE_URL", "").strip() or _DEFAULT_DSN


def _iter_sessions(session_id: Optional[str] = None, min_bytes: int = 0):
    """Yield (id, bpmn_xml) tuples from the sessions table."""
    import psycopg2  # type: ignore

    dsn = _get_dsn()
    con = psycopg2.connect(dsn)
    cur = con.cursor()
    try:
        if session_id:
            cur.execute(
                "SELECT id, bpmn_xml FROM sessions WHERE id = %s",
                [session_id],
            )
        else:
            cur.execute(
                "SELECT id, bpmn_xml FROM sessions WHERE octet_length(bpmn_xml) > %s",
                [min_bytes],
            )
        for row in cur.fetchall():
            yield str(row[0]), str(row[1] or "")
    finally:
        cur.close()
        con.close()


def _update_bpmn_xml(session_id: str, new_xml: str) -> None:
    import psycopg2  # type: ignore

    dsn = _get_dsn()
    con = psycopg2.connect(dsn)
    cur = con.cursor()
    try:
        cur.execute(
            "UPDATE sessions SET bpmn_xml = %s WHERE id = %s",
            [new_xml, session_id],
        )
        con.commit()
    finally:
        cur.close()
        con.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Deduplicate camunda/zeebe :property entries in Postgres bpmn_xml"
    )
    parser.add_argument("--session", default=None, help="Target a single session ID")
    parser.add_argument("--dry-run", action="store_true", help="Print stats only, no DB writes")
    parser.add_argument("--min-size-kb", type=int, default=50,
                        help="Skip sessions smaller than N KB (default 50)")
    parser.add_argument("--threshold", type=int, default=3,
                        help="Only clean blocks with more than N properties (default 3)")
    args = parser.parse_args()

    min_bytes = args.min_size_kb * 1024

    processed = 0
    cleaned = 0
    total_removed = 0

    print(f"DSN: {_get_dsn()}")
    print(f"Threshold: >{args.threshold} props/block  |  Min size: {args.min_size_kb} KB")
    if args.dry_run:
        print("DRY RUN — no changes will be written.\n")
    else:
        print()

    for sid, xml in _iter_sessions(session_id=args.session, min_bytes=min_bytes if not args.session else 0):
        size_kb = len(xml.encode()) // 1024
        processed += 1

        new_xml, removed = dedup_bpmn_xml(xml, threshold=args.threshold)
        if removed == 0:
            print(f"  {sid}  {size_kb} KB  — no duplicates found")
            continue

        cleaned += 1
        total_removed += removed
        new_size_kb = len(new_xml.encode()) // 1024
        print(
            f"  {sid}  {size_kb} KB → {new_size_kb} KB  removed {removed} duplicate properties",
            end="",
        )

        if args.dry_run:
            print("  [DRY RUN]")
        else:
            _update_bpmn_xml(sid, new_xml)
            print("  [SAVED]")

    print()
    print(f"Scanned: {processed}  Cleaned: {cleaned}  Total props removed: {total_removed}")
    if args.dry_run:
        print("DRY RUN — no changes written to DB.")


if __name__ == "__main__":
    main()
