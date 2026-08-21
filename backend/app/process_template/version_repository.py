"""E7.2 — repository для process_template_version (опубликованные версии).

Compat-стиль как ``repository.py``: ``storage._connect`` + ``?``-плейсхолдеры.

Version numbering (locked decision): patch — автоинкремент от последней
опубликованной версии; minor/major — ручной bump параметром publish.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from ..storage import _connect

_COLUMNS = (
    "id, template_id, version, status, ui_model, bpmn_xml, "
    "precheck_report, dry_run_report, created_by, created_at"
)

_SEMVER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def _json_field(value: Any) -> Any:
    if value is None or isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return None


def _row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": str(row.get("id") or ""),
        "template_id": str(row.get("template_id") or ""),
        "version": row.get("version"),
        "status": row.get("status"),
        "ui_model": _json_field(row.get("ui_model")),
        "bpmn_xml": row.get("bpmn_xml"),
        "precheck_report": _json_field(row.get("precheck_report")),
        "dry_run_report": _json_field(row.get("dry_run_report")),
        "created_by": row.get("created_by"),
        "created_at": row.get("created_at"),
    }


def parse_semver(value: Any) -> Optional[Tuple[int, int, int]]:
    match = _SEMVER_RE.match(str(value or "").strip())
    if not match:
        return None
    return int(match.group(1)), int(match.group(2)), int(match.group(3))


class ProcessTemplateVersionRepository:
    def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        version_id = str(uuid.uuid4())
        now = datetime.utcnow()
        with _connect() as con:
            row = con.execute(
                f"""
                INSERT INTO process_template_version ({_COLUMNS})
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING {_COLUMNS}
                """,
                [
                    version_id,
                    data["template_id"],
                    data["version"],
                    data.get("status", "published"),
                    json.dumps(data.get("ui_model")) if data.get("ui_model") is not None else None,
                    data.get("bpmn_xml"),
                    json.dumps(data.get("precheck_report")) if data.get("precheck_report") is not None else None,
                    json.dumps(data.get("dry_run_report")) if data.get("dry_run_report") is not None else None,
                    data.get("created_by") or "",
                    now,
                ],
            ).fetchone()
            con.commit()
        return _row_to_dict(row)

    def list_for_template(self, template_id: str) -> List[Dict[str, Any]]:
        with _connect() as con:
            rows = con.execute(
                f"SELECT {_COLUMNS} FROM process_template_version WHERE template_id = ? "
                "ORDER BY created_at DESC, version DESC",
                [template_id],
            ).fetchall()
        return [_row_to_dict(row) for row in rows]

    def get_by_version(self, template_id: str, version: str) -> Optional[Dict[str, Any]]:
        with _connect() as con:
            row = con.execute(
                f"SELECT {_COLUMNS} FROM process_template_version WHERE template_id = ? AND version = ?",
                [template_id, version],
            ).fetchone()
        return _row_to_dict(row) if row else None

    def latest_published(self, template_id: str) -> Optional[Dict[str, Any]]:
        with _connect() as con:
            row = con.execute(
                f"SELECT {_COLUMNS} FROM process_template_version "
                "WHERE template_id = ? AND status = 'published' "
                "ORDER BY created_at DESC LIMIT 1",
                [template_id],
            ).fetchone()
        return _row_to_dict(row) if row else None

    def retire_published(self, template_id: str) -> int:
        """Все published версии шаблона → retired (перед вставкой новой)."""
        with _connect() as con:
            cur = con.execute(
                "UPDATE process_template_version SET status = 'retired' "
                "WHERE template_id = ? AND status = 'published'",
                [template_id],
            )
            con.commit()
            return int(getattr(cur, "rowcount", 0) or 0)

    def next_version(self, template_id: str, current_draft_version: str, bump: str = "patch") -> str:
        """Следующий номер версии.

        patch: последняя published + 1 в patch (первый publish — версия
        черновика как есть). minor/major: ручной bump от последней
        published (или от версии черновика, если published ещё нет).
        """
        bump = (bump or "patch").strip().lower()
        if bump not in ("patch", "minor", "major"):
            raise ValueError(f"unsupported bump: {bump!r}")
        latest = self.latest_published(template_id)
        if latest is None:
            base = parse_semver(current_draft_version) or (0, 1, 0)
            if bump == "patch":
                return f"{base[0]}.{base[1]}.{base[2]}"
        else:
            base = parse_semver(latest.get("version")) or (0, 1, 0)
            if bump == "patch":
                return f"{base[0]}.{base[1]}.{base[2] + 1}"
        if bump == "minor":
            return f"{base[0]}.{base[1] + 1}.0"
        return f"{base[0] + 1}.0.0"
