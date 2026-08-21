from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .error_event_helpers import _normalize_nullable_id, _normalize_slug, _normalize_text

SCHEMA_VERSION = 1
_ALLOWED_PRIORITIES = {"low", "normal", "high", "urgent"}


def _generate_notification_id() -> str:
    from .error_event_helpers import generate_event_id

    return "ntf_" + generate_event_id().split("_", 1)[1]


def _now_ts() -> int:
    from .error_event_helpers import _now_ts as _nt

    return _nt()


class NotificationIn(BaseModel):
    """Input payload for creating a user notification."""

    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(default=SCHEMA_VERSION)
    type: str
    title: str
    message: str
    user_id: Optional[str] = None
    org_id: Optional[str] = None
    priority: str = "normal"
    link: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("type")
    @classmethod
    def _validate_type(cls, value: str) -> str:
        normalized = _normalize_slug(value)
        if not normalized:
            raise ValueError("type must be a non-empty slug")
        return normalized

    @field_validator("title", "message")
    @classmethod
    def _validate_text(cls, value: str) -> str:
        text = _normalize_text(value, max_len=2000)
        if not text:
            raise ValueError("field is required")
        return text

    @field_validator("priority")
    @classmethod
    def _validate_priority(cls, value: str) -> str:
        normalized = str(value or "").strip().lower()
        if normalized not in _ALLOWED_PRIORITIES:
            raise ValueError(f"priority must be one of {sorted(_ALLOWED_PRIORITIES)}")
        return normalized

    @model_validator(mode="after")
    def _validate_schema_version(self) -> "NotificationIn":
        if int(self.schema_version or 0) != SCHEMA_VERSION:
            raise ValueError(f"schema_version must be {SCHEMA_VERSION}")
        return self


class NotificationOut(BaseModel):
    """Stored notification representation."""

    model_config = ConfigDict(extra="forbid")

    id: str
    schema_version: int
    created_at: int
    type: str
    title: str
    message: str
    user_id: Optional[str] = None
    org_id: Optional[str] = None
    priority: str
    link: Optional[str] = None
    read_at: Optional[int] = None
    dismissed_at: Optional[int] = None
    payload: Dict[str, Any]


class NotificationPatchIn(BaseModel):
    """Fields allowed when patching a notification."""

    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = None
    message: Optional[str] = None
    priority: Optional[str] = None
    link: Optional[str] = None
    read_at: Optional[int] = None
    dismissed_at: Optional[int] = None
    payload: Optional[Dict[str, Any]] = None

    @field_validator("title", "message")
    @classmethod
    def _validate_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        text = _normalize_text(value, max_len=2000)
        if not text:
            raise ValueError("field cannot be empty")
        return text

    @field_validator("priority")
    @classmethod
    def _validate_priority(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value or "").strip().lower()
        if normalized not in _ALLOWED_PRIORITIES:
            raise ValueError(f"priority must be one of {sorted(_ALLOWED_PRIORITIES)}")
        return normalized


class NotificationListOut(BaseModel):
    ok: bool = True
    items: List[NotificationOut] = Field(default_factory=list)
    count: int = 0
    page: Dict[str, Any] = Field(default_factory=dict)
    filters: Dict[str, Any] = Field(default_factory=dict)
