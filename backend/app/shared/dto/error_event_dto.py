from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .error_event_helpers import (
    _MAX_ID,
    _MAX_ROUTE,
    _MAX_TEXT,
    _normalize_nullable_id,
    _normalize_route,
    _normalize_slug,
    _normalize_text,
)

SCHEMA_VERSION = 1
_ALLOWED_SEVERITIES = {"fatal", "error", "warn", "info"}
_ALLOWED_SOURCES = {"frontend", "backend", "server", "worker"}


class ErrorEventIn(BaseModel):
    """Input payload for ingesting an error/telemetry event."""

    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(default=SCHEMA_VERSION)
    event_type: str
    severity: str
    message: str
    occurred_at: int | float | str | None = None
    source: str
    user_id: Optional[str] = None
    org_id: Optional[str] = None
    session_id: Optional[str] = None
    project_id: Optional[str] = None
    route: Optional[str] = None
    runtime_id: Optional[str] = None
    tab_id: Optional[str] = None
    request_id: Optional[str] = None
    correlation_id: Optional[str] = None
    app_version: Optional[str] = None
    git_sha: Optional[str] = None
    fingerprint: Optional[str] = None
    context_json: Dict[str, Any] = Field(default_factory=dict)

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
        text = _normalize_text(value, max_len=_MAX_TEXT)
        if not text:
            raise ValueError("message is required")
        return text

    @model_validator(mode="after")
    def _validate_schema_version(self) -> "ErrorEventIn":
        if int(self.schema_version or 0) != SCHEMA_VERSION:
            raise ValueError(f"schema_version must be {SCHEMA_VERSION}")
        return self


class ErrorEventOut(BaseModel):
    """Stored error event representation."""

    model_config = ConfigDict(extra="forbid")

    id: str
    schema_version: int
    occurred_at: int
    ingested_at: int
    source: str
    event_type: str
    severity: str
    message: str
    user_id: Optional[str] = None
    org_id: Optional[str] = None
    session_id: Optional[str] = None
    project_id: Optional[str] = None
    route: Optional[str] = None
    runtime_id: Optional[str] = None
    tab_id: Optional[str] = None
    request_id: Optional[str] = None
    correlation_id: Optional[str] = None
    app_version: Optional[str] = None
    git_sha: Optional[str] = None
    fingerprint: str
    context_json: Dict[str, Any]


class ErrorEventListOut(BaseModel):
    ok: bool = True
    items: List[ErrorEventOut] = Field(default_factory=list)
    count: int = 0
    page: Dict[str, Any] = Field(default_factory=dict)
    filters: Dict[str, Any] = Field(default_factory=dict)
    timeline: Dict[str, Any] = Field(default_factory=dict)


class ErrorEventPatchIn(BaseModel):
    """Fields allowed when patching an existing error event."""

    model_config = ConfigDict(extra="forbid")

    severity: Optional[str] = None
    message: Optional[str] = None
    context_json: Optional[Dict[str, Any]] = None

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
        text = _normalize_text(value, max_len=_MAX_TEXT)
        if not text:
            raise ValueError("message cannot be empty")
        return text


class ErrorEventIngestResponse(BaseModel):
    ok: bool = True
    item: Dict[str, Any]
