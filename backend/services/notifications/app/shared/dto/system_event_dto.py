from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .error_event_helpers import _normalize_nullable_id, _normalize_slug, _normalize_text

SCHEMA_VERSION = 1
_ALLOWED_SEVERITIES = {"fatal", "error", "warn", "info"}


def _generate_system_event_id() -> str:
    from .error_event_helpers import generate_event_id

    return "sys_" + generate_event_id().split("_", 1)[1]


def _now_ts() -> int:
    from .error_event_helpers import _now_ts as _nt

    return _nt()


class SystemEventIn(BaseModel):
    """Input payload for creating a system event."""

    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(default=SCHEMA_VERSION)
    event_type: str
    severity: str
    message: str
    source: str
    org_id: Optional[str] = None
    user_id: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("event_type", "source")
    @classmethod
    def _validate_slug(cls, value: str) -> str:
        normalized = _normalize_slug(value)
        if not normalized:
            raise ValueError("must be a non-empty slug")
        return normalized

    @field_validator("severity")
    @classmethod
    def _validate_severity(cls, value: str) -> str:
        normalized = str(value or "").strip().lower()
        if normalized not in _ALLOWED_SEVERITIES:
            raise ValueError(f"severity must be one of {sorted(_ALLOWED_SEVERITIES)}")
        return normalized

    @field_validator("message")
    @classmethod
    def _validate_message(cls, value: str) -> str:
        text = _normalize_text(value, max_len=4000)
        if not text:
            raise ValueError("message is required")
        return text

    @model_validator(mode="after")
    def _validate_schema_version(self) -> "SystemEventIn":
        if int(self.schema_version or 0) != SCHEMA_VERSION:
            raise ValueError(f"schema_version must be {SCHEMA_VERSION}")
        return self


class SystemEventOut(BaseModel):
    """Stored system event representation."""

    model_config = ConfigDict(extra="forbid")

    id: str
    schema_version: int
    created_at: int
    event_type: str
    severity: str
    message: str
    source: str
    org_id: Optional[str] = None
    user_id: Optional[str] = None
    payload: Dict[str, Any]


class SystemEventPatchIn(BaseModel):
    """Fields allowed when patching a system event."""

    model_config = ConfigDict(extra="forbid")

    severity: Optional[str] = None
    message: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None

    @field_validator("severity")
    @classmethod
    def _validate_severity(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value or "").strip().lower()
        if normalized not in _ALLOWED_SEVERITIES:
            raise ValueError(f"severity must be one of {sorted(_ALLOWED_SEVERITIES)}")
        return normalized

    @field_validator("message")
    @classmethod
    def _validate_message(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        text = _normalize_text(value, max_len=4000)
        if not text:
            raise ValueError("message cannot be empty")
        return text


class SystemEventListOut(BaseModel):
    ok: bool = True
    items: List[SystemEventOut] = Field(default_factory=list)
    count: int = 0
    page: Dict[str, Any] = Field(default_factory=dict)
    filters: Dict[str, Any] = Field(default_factory=dict)
