from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

try:
    import bcrypt  # type: ignore
except Exception:
    bcrypt = None


DEFAULT_JWT_SECRET = "dev-insecure-change-me"
ACCESS_TOKEN_TTL_MIN = 15
REFRESH_TOKEN_TTL_DAYS = 14
PBKDF2_ITERATIONS = 390_000


class AuthError(Exception):
    """Raised when auth token validation or credential checks fail."""


@dataclass
class AuthStore:
    base_dir: Path

    def __post_init__(self) -> None:
        self.base_dir.mkdir(parents=True, exist_ok=True)

    @property
    def users_path(self) -> Path:
        return self.base_dir / "_auth_users.json"

    @property
    def refresh_path(self) -> Path:
        return self.base_dir / "_auth_refresh_tokens.json"

    def _read_list(self, path: Path) -> list[Dict[str, Any]]:
        if not path.exists():
            return []
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, list):
                return [x for x in raw if isinstance(x, dict)]
        except Exception:
            return []
        return []

    def _write_list(self, path: Path, data: list[Dict[str, Any]]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def list_users(self) -> list[Dict[str, Any]]:
        from .storage import list_auth_users

        return list_auth_users()

    def save_users(self, users: list[Dict[str, Any]]) -> None:
        from .storage import save_auth_users

        save_auth_users(users)

    def list_refresh_tokens(self) -> list[Dict[str, Any]]:
        return self._read_list(self.refresh_path)

    def save_refresh_tokens(self, rows: list[Dict[str, Any]]) -> None:
        self._write_list(self.refresh_path, rows)


def _bool_env(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name, "")).strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def now_ts() -> int:
    return int(time.time())


def access_ttl_seconds() -> int:
    ttl = os.getenv("JWT_ACCESS_TTL_MIN", "").strip()
    try:
        mins = int(ttl or ACCESS_TOKEN_TTL_MIN)
    except Exception:
        mins = ACCESS_TOKEN_TTL_MIN
    mins = max(1, mins)
    return mins * 60


def refresh_ttl_seconds() -> int:
    ttl = os.getenv("JWT_REFRESH_TTL_DAYS", "").strip()
    try:
        days = int(ttl or REFRESH_TOKEN_TTL_DAYS)
    except Exception:
        days = REFRESH_TOKEN_TTL_DAYS
    days = max(1, days)
    return days * 24 * 60 * 60


def jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET", "").strip()
    return secret or DEFAULT_JWT_SECRET


def refresh_cookie_secure() -> bool:
    return _bool_env("COOKIE_SECURE", default=False)


def refresh_cookie_samesite() -> str:
    raw = str(os.getenv("COOKIE_SAMESITE", "Lax")).strip().lower()
    if raw in {"strict", "none", "lax"}:
        return raw
    return "lax"


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64url_decode(raw: str) -> bytes:
    s = str(raw or "")
    pad = "=" * ((4 - len(s) % 4) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("utf-8"))


def _jwt_encode(payload: Dict[str, Any]) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    p1 = _b64url_encode(json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    p2 = _b64url_encode(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    msg = f"{p1}.{p2}".encode("utf-8")
    sig = hmac.new(jwt_secret().encode("utf-8"), msg, hashlib.sha256).digest()
    return f"{p1}.{p2}.{_b64url_encode(sig)}"


def _jwt_decode(token: str) -> Dict[str, Any]:
    parts = str(token or "").split(".")
    if len(parts) != 3:
        raise AuthError("invalid_token")

    h_b64, p_b64, s_b64 = parts
    msg = f"{h_b64}.{p_b64}".encode("utf-8")
    expected = hmac.new(jwt_secret().encode("utf-8"), msg, hashlib.sha256).digest()
    got = _b64url_decode(s_b64)
    if not hmac.compare_digest(expected, got):
        raise AuthError("invalid_signature")

    try:
        payload = json.loads(_b64url_decode(p_b64).decode("utf-8"))
    except Exception as e:
        raise AuthError("invalid_payload") from e

    if not isinstance(payload, dict):
        raise AuthError("invalid_payload")

    exp = int(payload.get("exp") or 0)
    if exp <= 0 or exp <= now_ts():
        raise AuthError("token_expired")

    return payload


def _pbkdf2_hash(password: str, salt: Optional[bytes] = None) -> str:
    salt_bytes = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        str(password or "").encode("utf-8"),
        salt_bytes,
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${_b64url_encode(salt_bytes)}${_b64url_encode(digest)}"


def hash_password(password: str) -> str:
    if not str(password or ""):
        raise AuthError("empty_password")
    if bcrypt is not None:
        return bcrypt.hashpw(str(password).encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    return _pbkdf2_hash(password)


def verify_password(password: str, stored_hash: str) -> bool:
    raw = str(stored_hash or "")
    if raw.startswith("$2") and bcrypt is not None:
        try:
            return bool(bcrypt.checkpw(str(password).encode("utf-8"), raw.encode("utf-8")))
        except Exception:
            return False
    if not raw.startswith("pbkdf2_sha256$"):
        return False
    parts = raw.split("$")
    if len(parts) != 4:
        return False
    _, iterations_raw, salt_b64, digest_b64 = parts
    try:
        iterations = int(iterations_raw)
        if iterations <= 0:
            return False
        salt = _b64url_decode(salt_b64)
    except Exception:
        return False

    check = hashlib.pbkdf2_hmac(
        "sha256",
        str(password or "").encode("utf-8"),
        salt,
        iterations,
    )
    expected = _b64url_encode(check)
    return hmac.compare_digest(expected, digest_b64)


def normalize_email(email: str) -> str:
    return str(email or "").strip().lower()


def _storage_dir() -> Path:
    base = os.environ.get("PROCESS_STORAGE_DIR", "workspace/.session_store")
    return Path(base)


def get_auth_store() -> AuthStore:
    return AuthStore(base_dir=_storage_dir())


def find_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    target = normalize_email(email)
    if not target:
        return None
    from .storage import get_auth_user_by_email

    return get_auth_user_by_email(target)


def find_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return None
    from .storage import get_auth_user_by_id

    return get_auth_user_by_id(uid)


def ensure_invited_identity(email: str) -> Dict[str, Any]:
    em = normalize_email(email)
    if not em:
        raise AuthError("email_required")
    from .storage import create_auth_user

    existing = find_user_by_email(em)
    if existing:
        return existing
    row = {
        "id": uuid.uuid4().hex,
        "email": em,
        "password_hash": "",
        "is_active": False,
        "is_admin": False,
        "created_at": now_ts(),
        "activation_pending": True,
    }
    try:
        return create_auth_user(row)
    except ValueError as exc:
        raise AuthError(str(exc)) from exc


def set_invited_identity_password(email: str, password: str) -> Dict[str, Any]:
    em = normalize_email(email)
    if not em:
        raise AuthError("email_required")
    current = find_user_by_email(em)
    if not current:
        raise AuthError("identity_not_found")
    if bool(current.get("is_active")) and str(current.get("password_hash") or "").strip():
        raise AuthError("identity_already_active")
    from .storage import update_auth_user

    try:
        return update_auth_user(
            str(current.get("id") or ""),
            password_hash=hash_password(password),
            is_active=True,
            activation_pending=False,
            activated_at=now_ts(),
        )
    except ValueError as exc:
        raise AuthError(str(exc)) from exc


def create_user(
    email: str,
    password: str,
    *,
    is_admin: bool = False,
    is_active: bool = True,
    full_name: str = "",
    job_title: str = "",
) -> Dict[str, Any]:
    em = normalize_email(email)
    if not em:
        raise AuthError("email_required")
    if find_user_by_email(em):
        raise AuthError("email_exists")

    row = {
        "id": uuid.uuid4().hex,
        "email": em,
        "password_hash": hash_password(password),
        "is_active": bool(is_active),
        "is_admin": bool(is_admin),
        "created_at": now_ts(),
        "full_name": str(full_name or "").strip(),
        "job_title": str(job_title or "").strip(),
    }

    from .storage import create_auth_user

    try:
        return create_auth_user(row)
    except ValueError as exc:
        raise AuthError(str(exc)) from exc


def list_users() -> list[Dict[str, Any]]:
    from .storage import list_auth_users

    rows = [dict(item or {}) for item in list_auth_users()]
    rows.sort(key=lambda item: (normalize_email(item.get("email")), str(item.get("id") or "")))
    return rows


def update_user(
    user_id: str,
    *,
    email: Optional[str] = None,
    password: Optional[str] = None,
    is_admin: Optional[bool] = None,
    is_active: Optional[bool] = None,
    full_name: Optional[str] = None,
    job_title: Optional[str] = None,
) -> Dict[str, Any]:
    uid = str(user_id or "").strip()
    if not uid:
        raise AuthError("user_id_required")
    current = find_user_by_id(uid)
    if not current:
        raise AuthError("user_not_found")
    fields: Dict[str, Any] = {}
    if email is not None:
        em = normalize_email(email)
        if not em:
            raise AuthError("email_required")
        duplicate = find_user_by_email(em)
        if duplicate and str(duplicate.get("id") or "").strip() != uid:
            raise AuthError("email_exists")
        fields["email"] = em
    if password is not None:
        pwd = str(password or "")
        if not pwd:
            raise AuthError("empty_password")
        fields["password_hash"] = hash_password(pwd)
        fields["activation_pending"] = False
    if is_admin is not None:
        fields["is_admin"] = bool(is_admin)
    if is_active is not None:
        fields["is_active"] = bool(is_active)
    if full_name is not None:
        fields["full_name"] = str(full_name or "").strip()
    if job_title is not None:
        fields["job_title"] = str(job_title or "").strip()
    from .storage import update_auth_user

    try:
        return update_auth_user(uid, **fields)
    except ValueError as exc:
        raise AuthError(str(exc)) from exc


def seed_admin_user_if_enabled() -> Optional[Dict[str, Any]]:
    if not _bool_env("DEV_SEED_ADMIN", default=False):
        return None

    email = normalize_email(os.getenv("ADMIN_EMAIL", "admin@local"))
    password = str(os.getenv("ADMIN_PASSWORD", "admin")).strip()
    if not email or not password:
        return None

    existing = find_user_by_email(email)
    if existing:
        return existing

    return create_user(email, password, is_admin=True, is_active=True)


def authenticate_user(email: str, password: str) -> Dict[str, Any]:
    user = find_user_by_email(email)
    if not user:
        raise AuthError("invalid_credentials")
    if not bool(user.get("is_active", True)):
        raise AuthError("inactive_user")
    if not verify_password(password, str(user.get("password_hash") or "")):
        raise AuthError("invalid_credentials")
    return user


def create_access_token(user_id: str) -> str:
    now = now_ts()
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + access_ttl_seconds(),
        "type": "access",
    }
    return _jwt_encode(payload)


def create_refresh_token(user_id: str, jti: str) -> str:
    now = now_ts()
    payload = {
        "sub": str(user_id),
        "jti": str(jti),
        "type": "refresh",
        "iat": now,
        "exp": now + refresh_ttl_seconds(),
    }
    return _jwt_encode(payload)


def decode_access_token(token: str) -> Dict[str, Any]:
    payload = _jwt_decode(token)
    if str(payload.get("type") or "") != "access":
        raise AuthError("wrong_token_type")
    if not str(payload.get("sub") or ""):
        raise AuthError("invalid_sub")
    return payload


def decode_refresh_token(token: str) -> Dict[str, Any]:
    payload = _jwt_decode(token)
    if str(payload.get("type") or "") != "refresh":
        raise AuthError("wrong_token_type")
    if not str(payload.get("sub") or ""):
        raise AuthError("invalid_sub")
    if not str(payload.get("jti") or ""):
        raise AuthError("invalid_jti")
    return payload


def _find_refresh_index(rows: list[Dict[str, Any]], jti: str) -> int:
    for idx, row in enumerate(rows):
        if str(row.get("jti") or "") == str(jti):
            return idx
    return -1


def create_refresh_record(
    *,
    user_id: str,
    jti: str,
    expires_at: int,
    user_agent: str = "",
    ip: str = "",
) -> Dict[str, Any]:
    row = {
        "id": uuid.uuid4().hex,
        "user_id": str(user_id),
        "jti": str(jti),
        "issued_at": now_ts(),
        "expires_at": int(expires_at),
        "revoked_at": None,
        "replaced_by_jti": None,
        "user_agent": str(user_agent or "")[:400],
        "ip": str(ip or "")[:120],
    }
    st = get_auth_store()
    rows = st.list_refresh_tokens()
    rows.append(row)
    st.save_refresh_tokens(rows)
    return row


def revoke_refresh_record(jti: str, *, replaced_by_jti: Optional[str] = None) -> bool:
    target = str(jti or "").strip()
    if not target:
        return False
    st = get_auth_store()
    rows = st.list_refresh_tokens()
    idx = _find_refresh_index(rows, target)
    if idx < 0:
        return False
    row = dict(rows[idx])
    row["revoked_at"] = now_ts()
    if replaced_by_jti:
        row["replaced_by_jti"] = str(replaced_by_jti)
    rows[idx] = row
    st.save_refresh_tokens(rows)
    return True


def rotate_refresh_token(
    refresh_token: str,
    *,
    user_agent: str = "",
    ip: str = "",
) -> Dict[str, Any]:
    payload = decode_refresh_token(refresh_token)
    old_jti = str(payload.get("jti") or "")
    user_id = str(payload.get("sub") or "")

    st = get_auth_store()
    rows = st.list_refresh_tokens()
    idx = _find_refresh_index(rows, old_jti)
    if idx < 0:
        raise AuthError("refresh_not_found")

    row = rows[idx]
    if row.get("revoked_at"):
        raise AuthError("refresh_revoked")

    expires_at = int(row.get("expires_at") or 0)
    if expires_at <= now_ts():
        raise AuthError("refresh_expired")

    user = find_user_by_id(user_id)
    if not user or not bool(user.get("is_active", True)):
        raise AuthError("invalid_user")

    new_jti = uuid.uuid4().hex
    row = dict(row)
    row["revoked_at"] = now_ts()
    row["replaced_by_jti"] = new_jti
    rows[idx] = row

    issued = now_ts()
    new_expires = issued + refresh_ttl_seconds()
    new_row = {
        "id": uuid.uuid4().hex,
        "user_id": user_id,
        "jti": new_jti,
        "issued_at": issued,
        "expires_at": new_expires,
        "revoked_at": None,
        "replaced_by_jti": None,
        "user_agent": str(user_agent or "")[:400],
        "ip": str(ip or "")[:120],
    }
    rows.append(new_row)
    st.save_refresh_tokens(rows)

    return {
        "user": user,
        "refresh_token": create_refresh_token(user_id, new_jti),
        "refresh_expires_at": new_expires,
        "access_token": create_access_token(user_id),
    }


def revoke_refresh_from_token(refresh_token: str) -> bool:
    try:
        payload = decode_refresh_token(refresh_token)
    except AuthError:
        return False
    jti = str(payload.get("jti") or "")
    return revoke_refresh_record(jti)


def issue_login_tokens(
    *,
    user: Dict[str, Any],
    user_agent: str = "",
    ip: str = "",
) -> Dict[str, Any]:
    user_id = str(user.get("id") or "")
    if not user_id:
        raise AuthError("invalid_user")

    now = now_ts()
    refresh_expires = now + refresh_ttl_seconds()
    jti = uuid.uuid4().hex
    create_refresh_record(
        user_id=user_id,
        jti=jti,
        expires_at=refresh_expires,
        user_agent=user_agent,
        ip=ip,
    )

    return {
        "access_token": create_access_token(user_id),
        "refresh_token": create_refresh_token(user_id, jti),
        "refresh_expires_at": refresh_expires,
    }


def user_from_bearer_header(authorization: str) -> Dict[str, Any]:
    raw = str(authorization or "").strip()
    if not raw.lower().startswith("bearer "):
        raise AuthError("missing_bearer")
    token = raw[7:].strip()
    if not token:
        raise AuthError("missing_bearer")
    payload = decode_access_token(token)
    user = find_user_by_id(str(payload.get("sub") or ""))
    if not user or not bool(user.get("is_active", True)):
        raise AuthError("invalid_user")
    return user
