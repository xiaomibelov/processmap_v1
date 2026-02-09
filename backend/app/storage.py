from __future__ import annotations
import json, os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from .models import Session
@dataclass
class Storage:
    base_dir: Path
    def __post_init__(self) -> None:
        self.base_dir.mkdir(parents=True, exist_ok=True)
    def session_path(self, session_id: str) -> Path:
        return self.base_dir / f"{session_id}.json"
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
