from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict

import requests


DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"


def _storage_dir() -> Path:
    base = os.environ.get("PROCESS_STORAGE_DIR", "workspace/.session_store")
    return Path(base)


def _llm_settings_path() -> Path:
    return _storage_dir() / "_llm_settings.json"


def _normalize_base_url(base_url: str) -> str:
    u = (base_url or "").strip()
    if not u:
        u = DEFAULT_DEEPSEEK_BASE_URL
    u = u.rstrip("/")

    low = u.lower()
    if low.endswith("/v1/chat/completions"):
        u = u[: -len("/v1/chat/completions")]
    elif low.endswith("/chat/completions"):
        u = u[: -len("/chat/completions")]

    low = u.lower()
    if low.endswith("/v1"):
        u = u[: -len("/v1")]

    u = u.rstrip("/")
    return u or DEFAULT_DEEPSEEK_BASE_URL


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

    base_url = _normalize_base_url(base_url)
    return {"api_key": api_key, "base_url": base_url}


def llm_status() -> Dict[str, Any]:
    s = load_llm_settings()
    return {
        "has_api_key": bool((s.get("api_key") or "").strip()),
        "base_url": (s.get("base_url") or DEFAULT_DEEPSEEK_BASE_URL).strip().rstrip("/"),
    }


def save_llm_settings(api_key: str, base_url: str) -> Dict[str, Any]:
    k = (api_key or "").strip()
    u = _normalize_base_url(base_url)

    p = _llm_settings_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"api_key": k, "base_url": u}, ensure_ascii=False, indent=2), encoding="utf-8")

    return {"ok": True, "has_api_key": bool(k), "base_url": u}


def verify_llm_settings(api_key: str = "", base_url: str = "") -> Dict[str, Any]:
    cfg = load_llm_settings()
    k = (api_key or "").strip() or (cfg.get("api_key") or "").strip()
    u = _normalize_base_url(base_url or cfg.get("base_url") or DEFAULT_DEEPSEEK_BASE_URL)

    if not k:
        return {"ok": False, "error": "deepseek api_key is not set", "has_api_key": False, "base_url": u}

    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "Reply in one short line."},
            {"role": "user", "content": "health-check: reply with OK"},
        ],
        "temperature": 0.0,
        "max_tokens": 16,
    }

    t0 = time.time()
    try:
        res = requests.post(
            f"{u}/v1/chat/completions",
            headers={"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
            json=payload,
            timeout=20,
        )
        latency_ms = int((time.time() - t0) * 1000)
        if not res.ok:
            body = (res.text or "").strip()
            msg = f"HTTP {res.status_code}"
            if body:
                msg = f"{msg}: {body[:240]}"
            return {"ok": False, "error": msg, "has_api_key": True, "base_url": u, "latency_ms": latency_ms}

        data = res.json() if res.content else {}
        choices = data.get("choices") if isinstance(data, dict) else []
        content = ""
        if isinstance(choices, list) and choices:
            msg = choices[0].get("message") if isinstance(choices[0], dict) else {}
            content = str((msg or {}).get("content") or "").strip()

        return {
            "ok": True,
            "has_api_key": True,
            "base_url": u,
            "request_url": f"{u}/v1/chat/completions",
            "latency_ms": latency_ms,
            "model": str(data.get("model") or "deepseek-chat") if isinstance(data, dict) else "deepseek-chat",
            "preview": content[:120],
        }
    except Exception as e:
        latency_ms = int((time.time() - t0) * 1000)
        return {"ok": False, "error": str(e), "has_api_key": True, "base_url": u, "latency_ms": latency_ms}
