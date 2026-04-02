from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .models import Session, Project


@dataclass
class Storage:
    base_dir: Path

    def __post_init__(self) -> None:
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def session_path(self, session_id: str) -> Path:
        return self.base_dir / f"{session_id}.json"

    def create(self, title: str, roles: Optional[List[str]] = None) -> str:
        sid = uuid.uuid4().hex[:10]
        r = roles or ["cook_1", "cook_2", "brigadir", "technolog"]
        t = (title or "").strip() or sid
        s = Session(id=sid, title=t, roles=r, version=1)
        self.save(s)
        return sid

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
            if project_id is not None and raw.get(\"project_id\") != project_id:
                continue
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
            "project_id": project_id,
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

def gen_project_id() -> str:
    return uuid.uuid4().hex[:10]


class ProjectStorage:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, project_id: str) -> Path:
        return self.root / f"{project_id}.json"

    def create(self, title: str, passport: Dict[str, Any] | None = None) -> str:
        pid = gen_project_id()
        now = int(datetime.now(timezone.utc).timestamp())
        proj = Project(
            id=pid,
            title=title,
            passport=passport or {},
            created_at=now,
            updated_at=now,
            version=1,
        )
        self.save(proj)
        return pid

    def list(self) -> list[Project]:
        out: list[Project] = []
        for p in sorted(self.root.glob("*.json")):
            try:
                out.append(Project.model_validate_json(p.read_text(encoding="utf-8")))
            except Exception:
                continue
        # newest first
        out.sort(key=lambda x: x.updated_at or x.created_at or 0, reverse=True)
        return out

    def load(self, project_id: str) -> Project | None:
        p = self._path(project_id)
        if not p.exists():
            return None
        try:
            return Project.model_validate_json(p.read_text(encoding="utf-8"))
        except Exception:
            return None

    def save(self, proj: Project) -> None:
        now = int(datetime.now(timezone.utc).timestamp())
        if not proj.created_at:
            proj.created_at = now
        proj.updated_at = now
        # version bump on each save
        try:
            proj.version = int(getattr(proj, "version", 0) or 0) + 1
        except Exception:
            proj.version = 1
        self._path(proj.id).write_text(json.dumps(proj.model_dump(), ensure_ascii=False), encoding="utf-8")


def get_project_storage() -> ProjectStorage:
    root = os.getenv("PROJECT_STORAGE_DIR", "").strip()
    if root:
        return ProjectStorage(Path(root))
    # default workspace/projects
    return ProjectStorage(Path("/app/workspace/projects"))

def get_storage() -> Storage:
    base = os.environ.get("PROCESS_STORAGE_DIR", "workspace/.session_store")
    return Storage(base_dir=Path(base))
