from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

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

    def llm_settings_path(self) -> Path:
        return self.base_dir / "_llm_settings.json"

    def load_llm_settings(self) -> Dict[str, Any]:
        p = self.llm_settings_path()
        if not p.exists():
            return {"provider": "deepseek", "api_key": ""}
        try:
            obj = json.loads(p.read_text(encoding="utf-8"))
            if not isinstance(obj, dict):
                return {"provider": "deepseek", "api_key": ""}
            provider = (obj.get("provider") or "deepseek").strip() or "deepseek"
            api_key = (obj.get("api_key") or "").strip()
            base_url = (obj.get("base_url") or "").strip()
            out = {"provider": provider, "api_key": api_key}
            if base_url:
                out["base_url"] = base_url
            return out
        except Exception:
            return {"provider": "deepseek", "api_key": ""}

    def save_llm_settings(self, provider: str = "deepseek", api_key: str = "", base_url: str = "") -> None:
        p = self.llm_settings_path()
        obj: Dict[str, Any] = {
            "provider": (provider or "deepseek").strip() or "deepseek",
            "api_key": (api_key or "").strip(),
        }
        if (base_url or "").strip():
            obj["base_url"] = (base_url or "").strip()
        p.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

    def get_llm_api_key(self) -> str:
        env = os.environ.get("DEEPSEEK_API_KEY", "").strip()
        if env:
            return env
        s = self.load_llm_settings()
        return (s.get("api_key") or "").strip()

    def get_llm_base_url(self) -> str:
        env = os.environ.get("DEEPSEEK_BASE_URL", "").strip()
        if env:
            return env
        s = self.load_llm_settings()
        return (s.get("base_url") or "").strip()


def get_storage() -> Storage:
    base = os.environ.get("PROCESS_STORAGE_DIR", "workspace/.session_store")
    return Storage(base_dir=Path(base))
