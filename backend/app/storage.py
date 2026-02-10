from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .models import Session
@dataclass
class Storage:
    base_dir: Path
    def __post_init__(self) -> None:
        self.base_dir.mkdir(parents=True, exist_ok=True)
    def session_path(self, session_id: str) -> Path:
        return self.base_dir / f"{session_id}.json"

    def list(self, query: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
        q = (query or "").strip().lower()
        items: List[Dict[str, Any]] = []
        if not self.base_dir.exists():
            return items

        files = sorted(self.base_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)

        for p in files:
            if len(items) >= limit:
                break
            try:
                raw = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue

            sid = (raw.get("id") or p.stem or "").strip()
            title = (raw.get("title") or "").strip()
            notes = (raw.get("notes") or "").strip()
            roles = raw.get("roles") or []
            version = int(raw.get("version") or 0)

            qs = raw.get("questions") or []
            open_n = 0
            ans_n = 0
            for qq in qs:
                st = (qq or {}).get("status")
                if st == "answered":
                    ans_n += 1
                elif st == "open":
                    open_n += 1

            mtime = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat()

            hay = f"{sid} {title} {notes}".lower()
            if q and q not in hay:
                continue

            items.append(
                {
                    "id": sid,
                    "title": title,
                    "updated_at": mtime,
                    "version": version,
                    "roles": roles,
                    "open_questions": open_n,
                    "answered_questions": ans_n,
                    "notes_preview": notes[:140],
                }
            )

        return items

    def rename(self, session_id: str, title: str) -> Optional[Session]:
        s = self.load(session_id)
        if not s:
            return None
        s.title = (title or "").strip() or s.title
        self.save(s)
        return s
    def load(self, session_id: str) -> Optional[Session]:
        p = self.session_path(session_id)
        if not p.exists():
            return None
        return Session.model_validate(json.loads(p.read_text(encoding="utf-8")))
    def save(self, s: Session) -> None:
        p = self.session_path(s.id)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(s.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")
def get_storage() -> Storage:
    base = os.environ.get("PROCESS_STORAGE_DIR", "workspace/.session_store")
    return Storage(base_dir=Path(base))
