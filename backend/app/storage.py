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

    def create(
        self,
        title: str,
        roles: List[str] | None = None,
        *,
        start_role: Optional[str] = None,
        project_id: Optional[str] = None,
        mode: Optional[str] = None,
    ) -> str:
        sid = uuid.uuid4().hex[:10]

        r = [str(x).strip() for x in (roles or []) if str(x).strip()]
        r = list(dict.fromkeys(r))  # unique, preserve order

        sr = (start_role or "").strip() or None
        if sr and sr not in r:
            r = [sr] + r
        if not sr and r:
            sr = r[0]

        sess = Session(
            id=sid,
            title=(title or "process"),
            roles=r,
            start_role=sr,
            project_id=project_id,
            mode=mode,
            notes="[]",
            nodes=[],
            edges=[],
            questions=[],
            mermaid="",
            mermaid_simple="",
            mermaid_lanes="",
            normalized={},
            resources={},
            version=2,
        )
        self.save(sess)
        return sid

    def load(self, session_id: str) -> Optional[Session]:
        p = self.session_path(session_id)
        if not p.exists():
            return None
        try:
            return Session.model_validate(json.loads(p.read_text(encoding="utf-8")))
        except Exception:
            return None

    def save(self, s: Session) -> None:
        p = self.session_path(s.id)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(s.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")

    def delete(self, session_id: str) -> bool:
        p = self.session_path(session_id)
        if not p.exists():
            return False
        p.unlink()
        return True

    def rename(self, session_id: str, new_title: str) -> Optional[Session]:
        sess = self.load(session_id)
        if not sess:
            return None
        t = (new_title or "").strip()
        if t:
            sess.title = t
            self.save(sess)
        return sess

    def list(
        self,
        q: Optional[str] = None,
        *,
        query: Optional[str] = None,
        limit: int = 200,
        project_id: Optional[str] = None,
        mode: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        # Back-compat: allow both q and query
        qq = (query if query is not None else q)
        qq = (qq or "").strip().lower()

        lim = 200
        try:
            lim = int(limit)
        except Exception:
            lim = 200
        lim = min(max(lim, 1), 500)

        items: List[Dict[str, Any]] = []
        for p in sorted(self.base_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
            try:
                raw = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue

            if project_id is not None and (raw.get("project_id") or None) != project_id:
                continue
            if mode is not None and (raw.get("mode") or None) != mode:
                continue

            if qq:
                hay = " ".join(
                    [
                        str(raw.get("id") or ""),
                        str(raw.get("title") or ""),
                        " ".join(raw.get("roles") or []),
                    ]
                ).lower()
                if qq not in hay:
                    continue

            items.append(raw)
            if len(items) >= lim:
                break

        return items


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
        try:
            proj.version = int(getattr(proj, "version", 0) or 0) + 1
        except Exception:
            proj.version = 1
        self._path(proj.id).write_text(json.dumps(proj.model_dump(), ensure_ascii=False), encoding="utf-8")


def get_project_storage() -> ProjectStorage:
    root = os.getenv("PROJECT_STORAGE_DIR", "").strip()
    if root:
        return ProjectStorage(Path(root))
    return ProjectStorage(Path("/app/workspace/projects"))


def get_storage() -> Storage:
    base = os.environ.get("PROCESS_STORAGE_DIR", "workspace/.session_store")
    return Storage(base_dir=Path(base))
