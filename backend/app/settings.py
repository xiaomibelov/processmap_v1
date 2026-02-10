from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict


DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"


def _storage_dir() -> Path:
    base = os.environ.get("PROCESS_STORAGE_DIR", "workspace/.session_store")
    return Path(base)


def _llm_settings_path() -> Path:
    return _storage_dir() / "_llm_settings.json"


def load_llm_settings() -> Dict[str, str]:
    p = _llm_settings_path()

    api_key = (os.environ.get("DEEPSEEK_API_KEY") or "").strip()
    base_url = (os.environ.get("DEEPSEEK_BASE_URL") or "").strip() or DEFAULT_DEEPSEEK_BASE_URL

    if p.exists():
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                api_key = (raw.get("api_key") or "").strip() or api_key
                base_url = (raw.get("base_url") or "").strip() or base_url
        except Exception:
            pass

    base_url = (base_url or DEFAULT_DEEPSEEK_BASE_URL).strip().rstrip("/")
    return {"api_key": api_key, "base_url": base_url}


def llm_status() -> Dict[str, Any]:
    s = load_llm_settings()
    return {
        "has_api_key": bool((s.get("api_key") or "").strip()),
        "base_url": (s.get("base_url") or DEFAULT_DEEPSEEK_BASE_URL).strip().rstrip("/"),
    }


def save_llm_settings(api_key: str, base_url: str) -> Dict[str, Any]:
    k = (api_key or "").strip()
    u = (base_url or "").strip() or DEFAULT_DEEPSEEK_BASE_URL
    u = u.rstrip("/")

    p = _llm_settings_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"api_key": k, "base_url": u}, ensure_ascii=False, indent=2), encoding="utf-8")

    return {"ok": True, "has_api_key": bool(k), "base_url": u}
