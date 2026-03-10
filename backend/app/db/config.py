from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import urlsplit, urlunsplit


def _env_int(name: str, default: int) -> int:
    raw = str(os.environ.get(name, "") or "").strip()
    try:
        value = int(raw or default)
    except Exception:
        value = int(default)
    return max(1, value)


def _normalize_backend(raw: str) -> str:
    src = str(raw or "").strip().lower()
    if src in {"postgres", "postgresql", "pg"}:
        return "postgres"
    if src in {"sqlite", "sqlite3"}:
        return "sqlite"
    return "auto"


def _url_is_postgres(url: str) -> bool:
    scheme = str(urlsplit(str(url or "").strip()).scheme or "").lower()
    return scheme in {"postgres", "postgresql", "postgresql+psycopg"}


@dataclass(frozen=True)
class DBRuntimeConfig:
    backend: str
    database_url: str
    configured_backend: str
    pool_min_size: int
    pool_max_size: int
    startup_check: bool


def redact_database_url(url: str) -> str:
    src = str(url or "").strip()
    if not src:
        return ""
    try:
        parts = urlsplit(src)
    except Exception:
        return src
    if not parts.netloc or "@" not in parts.netloc:
        return src
    left, right = parts.netloc.rsplit("@", 1)
    if ":" in left:
        user = left.split(":", 1)[0]
        auth = f"{user}:***"
    else:
        auth = "***"
    netloc = f"{auth}@{right}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


@lru_cache(maxsize=1)
def get_db_runtime_config() -> DBRuntimeConfig:
    raw_backend = _normalize_backend(os.environ.get("FPC_DB_BACKEND", "auto"))
    database_url = str(os.environ.get("DATABASE_URL", "") or "").strip()

    if raw_backend == "postgres":
        backend = "postgres"
    elif raw_backend == "sqlite":
        backend = "sqlite"
    else:
        backend = "postgres" if _url_is_postgres(database_url) else "sqlite"

    if backend == "postgres" and not database_url:
        raise RuntimeError("FPC_DB_BACKEND=postgres requires DATABASE_URL")
    if backend == "postgres" and not _url_is_postgres(database_url):
        raise RuntimeError("DATABASE_URL must use postgres/postgresql scheme when postgres backend is selected")

    pool_min_size = _env_int("FPC_DB_POOL_MIN_SIZE", 1)
    pool_max_size = _env_int("FPC_DB_POOL_MAX_SIZE", 6)
    if pool_max_size < pool_min_size:
        pool_max_size = pool_min_size

    startup_check_raw = str(os.environ.get("FPC_DB_STARTUP_CHECK", "1") or "").strip().lower()
    startup_check = startup_check_raw not in {"0", "false", "no", "off"}

    return DBRuntimeConfig(
        backend=backend,
        database_url=database_url,
        configured_backend=raw_backend,
        pool_min_size=pool_min_size,
        pool_max_size=pool_max_size,
        startup_check=startup_check,
    )
