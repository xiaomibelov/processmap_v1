from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Callable, Dict, Mapping, Optional

from .diagram_owner_cutover import (
    DIAGRAM_OWNER_TRACE_MARKERS,
    owner_path_block_reason,
    resolve_diagram_owner_cutover_state,
)
from ..storage import (
    create_diagram_jazz_mapping_record,
    get_diagram_jazz_document_record,
    get_diagram_jazz_mapping_record,
    read_diagram_jazz_document_payload_record,
    reserve_diagram_jazz_document_record,
    validate_diagram_jazz_mapping_record,
    write_diagram_jazz_document_payload_record,
)


DIAGRAM_JAZZ_BACKEND_CONTRACT_DRAFT = {
    "version": "diagram-jazz-backend-contract-draft-v1",
    "legacy_authoritative_source": "sessions.bpmn_xml",
    "identity_law": "org_id + project_id + session_id",
    "read_law": "single_read_path_jazz_only_without_legacy_fallback",
    "write_law": "single_write_path_jazz_only_without_legacy_dual_write",
    "cutover_law": "single_owner_switch_without_dual_durability",
}

DIAGRAM_JAZZ_BACKEND_DOC_ID_MAP_STORAGE_KEY = "fpc:diagram-jazz-docids"

DIAGRAM_JAZZ_BACKEND_TRACE_MARKERS = {
    "gate_state": "diagram_jazz_backend_gate_state",
    "adapter_not_active": "diagram_jazz_backend_adapter_not_active",
    "attempt_blocked_without_contract": "diagram_jazz_backend_attempt_blocked_without_contract",
}

DIAGRAM_JAZZ_BACKEND_STORAGE_TRACE_MARKERS = {
    "mapping_created": "diagram_jazz_storage_mapping_created",
    "mapping_resolved": "diagram_jazz_storage_mapping_resolved",
    "mapping_conflict": "diagram_jazz_storage_mapping_conflict",
    "attempt_blocked": "diagram_jazz_storage_attempt_blocked",
}

DIAGRAM_JAZZ_BACKEND_ADAPTER_TRACE_MARKERS = {
    "read_attempt": "diagram_jazz_adapter_read_attempt",
    "write_attempt": "diagram_jazz_adapter_write_attempt",
    "read_success": "diagram_jazz_adapter_read_success",
    "write_success": "diagram_jazz_adapter_write_success",
    "conflict": "diagram_jazz_adapter_conflict",
    "blocked": "diagram_jazz_adapter_blocked",
}


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_raw_text(value: Any) -> str:
    return "" if value is None else str(value)


def _parse_bool(value: Any, default: bool = False) -> bool:
    text = _as_text(value).lower()
    if not text:
        return default
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _normalize_mode(value: Any) -> str:
    return "jazz" if _as_text(value).lower() == "jazz" else "legacy"


@dataclass(frozen=True)
class DiagramJazzBackendActivation:
    enabled: bool
    requested_mode: str
    effective_mode: str
    provider: str
    unsupported: bool
    unsupported_reason: str
    source: str
    owner_requested_state: str = "legacy_owner"
    owner_effective_state: str = "legacy_owner"
    owner_state: str = "legacy_owner"
    owner_blocked_reason: str = ""
    owner_rollback_active: bool = False
    owner_preconditions: Optional[Dict[str, int]] = None
    scoped_gate_match: bool = False
    scoped_gate_scope: str = ""
    scoped_gate_blocked_reason: str = ""
    scoped_gate_operator: str = ""

    @property
    def jazz_mode(self) -> bool:
        return self.effective_mode == "jazz"


@dataclass(frozen=True)
class DiagramJazzBackendIdentity:
    valid: bool
    org_id: str
    project_id: str
    session_id: str
    scope_id: str
    doc_alias: str
    map_storage_key: str
    invalid_reason: str


def resolve_diagram_jazz_backend_activation(
    env: Optional[Mapping[str, str]] = None,
    *,
    org_id: Any = "",
    project_id: Any = "",
    session_id: Any = "",
    scope_id: Any = "",
    operator_user_id: Any = "",
) -> DiagramJazzBackendActivation:
    source_env = env if isinstance(env, Mapping) else os.environ
    enabled = _parse_bool(source_env.get("DIAGRAM_JAZZ_BACKEND_CONTRACT_DRAFT"), False)
    requested_mode = _normalize_mode(source_env.get("DIAGRAM_JAZZ_BACKEND_MODE"))
    provider = _as_text(source_env.get("DIAGRAM_JAZZ_BACKEND_PROVIDER") or "disabled")
    owner_cutover = resolve_diagram_owner_cutover_state(
        source_env,
        org_id=org_id,
        project_id=project_id,
        session_id=session_id,
        scope_id=scope_id,
        operator_id=operator_user_id,
    )

    effective_mode = "legacy"
    unsupported_reason = ""
    if requested_mode == "jazz":
        blocked = owner_path_block_reason(owner_cutover, "jazz")
        if not enabled and not blocked:
            blocked = "diagram_cutover_blocked_backend_gate_not_ready"
        if blocked:
            unsupported_reason = _as_text(blocked)
        else:
            effective_mode = "jazz"
    elif owner_cutover.diagram_owner == "jazz_owner":
        unsupported_reason = "diagram_cutover_invariant_violation_mode_owner_mismatch"

    if effective_mode == "jazz" and provider == "disabled":
        unsupported_reason = "diagram_jazz_backend_provider_missing"

    return DiagramJazzBackendActivation(
        enabled=enabled,
        requested_mode=requested_mode,
        effective_mode=effective_mode,
        provider=provider,
        unsupported=bool(unsupported_reason),
        unsupported_reason=unsupported_reason,
        source="env" if enabled else "default",
        owner_requested_state=_as_text(owner_cutover.requested_state or "legacy_owner"),
        owner_effective_state=_as_text(owner_cutover.effective_state or "legacy_owner"),
        owner_state=_as_text(owner_cutover.diagram_owner or "legacy_owner"),
        owner_blocked_reason=_as_text(owner_cutover.blocked_reason),
        owner_rollback_active=bool(owner_cutover.rollback_triggered),
        owner_preconditions=dict(owner_cutover.preconditions or {}),
        scoped_gate_match=bool(owner_cutover.scoped_gate_match),
        scoped_gate_scope=_as_text(owner_cutover.scoped_gate_scope),
        scoped_gate_blocked_reason=_as_text(owner_cutover.scoped_gate_blocked_reason),
        scoped_gate_operator=_as_text(owner_cutover.scoped_gate_operator),
    )


def build_diagram_jazz_backend_identity(
    *,
    org_id: Any,
    project_id: Any,
    session_id: Any,
) -> DiagramJazzBackendIdentity:
    org = _as_text(org_id)
    project = _as_text(project_id)
    session = _as_text(session_id)
    valid = bool(org and project and session)
    scope_id = f"{org}::{project}::{session}" if valid else ""
    return DiagramJazzBackendIdentity(
        valid=valid,
        org_id=org,
        project_id=project,
        session_id=session,
        scope_id=scope_id,
        doc_alias=f"diagram:{scope_id}" if scope_id else "",
        map_storage_key=DIAGRAM_JAZZ_BACKEND_DOC_ID_MAP_STORAGE_KEY,
        invalid_reason="" if valid else "missing_identity_segment",
    )


def diagram_jazz_backend_gate_payload(
    activation: DiagramJazzBackendActivation,
    identity: Optional[DiagramJazzBackendIdentity] = None,
) -> Dict[str, Any]:
    return {
        "marker": DIAGRAM_JAZZ_BACKEND_TRACE_MARKERS["gate_state"],
        "enabled": 1 if activation.enabled else 0,
        "requested_mode": activation.requested_mode,
        "effective_mode": activation.effective_mode,
        "provider": activation.provider,
        "unsupported": 1 if activation.unsupported else 0,
        "unsupported_reason": activation.unsupported_reason,
        "identity_valid": 1 if bool(identity and identity.valid) else 0,
        "identity_scope": _as_text(getattr(identity, "scope_id", "")),
        "owner_requested_state": _as_text(activation.owner_requested_state or "legacy_owner"),
        "owner_effective_state": _as_text(activation.owner_effective_state or "legacy_owner"),
        "diagram_owner_state": _as_text(activation.owner_state or "legacy_owner"),
        "owner_blocked_reason": _as_text(activation.owner_blocked_reason),
        "owner_rollback_active": 1 if activation.owner_rollback_active else 0,
        "scoped_gate_match": 1 if activation.scoped_gate_match else 0,
        "scoped_gate_scope": _as_text(activation.scoped_gate_scope),
        "scoped_gate_blocked_reason": _as_text(activation.scoped_gate_blocked_reason),
        "scoped_gate_operator": _as_text(activation.scoped_gate_operator),
        "owner_marker": DIAGRAM_OWNER_TRACE_MARKERS["owner_state"],
    }


def _blocked(reason: str, message: str) -> Dict[str, Any]:
    return {
        "ok": False,
        "status": 0,
        "blocked": reason,
        "error_code": reason,
        "error": message,
    }


def _blocked_with_status(reason: str, message: str, status: int) -> Dict[str, Any]:
    payload = _blocked(reason, message)
    payload["status"] = int(status or 0)
    return payload


def _emit_trace(
    on_trace: Optional[Callable[[str, Dict[str, Any]], None]],
    event: str,
    payload: Optional[Dict[str, Any]] = None,
) -> None:
    if not callable(on_trace):
        return
    try:
        on_trace(str(event or "unknown"), dict(payload or {}))
    except Exception:
        return


def _blocked_status_for_reason(reason: str) -> int:
    code = _as_text(reason).lower()
    if not code:
        return 400
    if "not_found" in code:
        return 404
    if "disabled" in code:
        return 503
    if "cutover_blocked" in code or "owner_" in code or "rollback" in code:
        return 409
    if "missing" in code or "invalid" in code:
        return 422
    if "conflict" in code or "mismatch" in code:
        return 409
    return 400


def _resolve_storage_contract_context(
    *,
    org_id: Any,
    project_id: Any,
    session_id: Any,
    provider: Any,
    env: Optional[Mapping[str, str]] = None,
    on_trace: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    activation = resolve_diagram_jazz_backend_activation(
        env,
        org_id=org_id,
        project_id=project_id,
        session_id=session_id,
    )
    identity = build_diagram_jazz_backend_identity(
        org_id=org_id,
        project_id=project_id,
        session_id=session_id,
    )
    provider_text = _as_text(provider or activation.provider).lower()
    payload = {
        "scope_id": identity.scope_id,
        "provider": provider_text,
        "effective_mode": activation.effective_mode,
    }

    if not activation.jazz_mode:
        reason = _as_text(activation.owner_blocked_reason or "")
        if not reason and activation.owner_rollback_active:
            reason = "diagram_cutover_rollback_active"
        if not reason:
            reason = "diagram_jazz_backend_disabled"
        _emit_trace(on_trace, DIAGRAM_JAZZ_BACKEND_STORAGE_TRACE_MARKERS["attempt_blocked"], {**payload, "reason": reason})
        return {
            "ok": False,
            "blocked": _blocked_with_status(
                reason,
                "Diagram Jazz backend storage scaffold is disabled by default.",
                _blocked_status_for_reason(reason),
            ),
            "activation": activation,
            "identity": identity,
            "provider": provider_text,
        }

    if activation.unsupported:
        reason = _as_text(activation.unsupported_reason or "diagram_jazz_backend_unsupported")
        _emit_trace(on_trace, DIAGRAM_JAZZ_BACKEND_STORAGE_TRACE_MARKERS["attempt_blocked"], {**payload, "reason": reason})
        return {
            "ok": False,
            "blocked": _blocked_with_status(
                reason,
                "Diagram Jazz backend storage scaffold cannot activate with unsupported contract/provider.",
                _blocked_status_for_reason(reason),
            ),
            "activation": activation,
            "identity": identity,
            "provider": provider_text,
        }

    if not identity.valid:
        reason = _as_text(identity.invalid_reason or "diagram_jazz_backend_identity_invalid")
        _emit_trace(on_trace, DIAGRAM_JAZZ_BACKEND_STORAGE_TRACE_MARKERS["attempt_blocked"], {**payload, "reason": reason})
        return {
            "ok": False,
            "blocked": _blocked_with_status(
                reason,
                "Diagram Jazz backend storage scaffold requires valid org/project/session identity.",
                _blocked_status_for_reason(reason),
            ),
            "activation": activation,
            "identity": identity,
            "provider": provider_text,
        }

    if not provider_text or provider_text == "disabled":
        reason = "diagram_jazz_backend_provider_missing"
        _emit_trace(on_trace, DIAGRAM_JAZZ_BACKEND_STORAGE_TRACE_MARKERS["attempt_blocked"], {**payload, "reason": reason})
        return {
            "ok": False,
            "blocked": _blocked_with_status(
                reason,
                "Diagram Jazz backend storage scaffold requires explicit provider.",
                _blocked_status_for_reason(reason),
            ),
            "activation": activation,
            "identity": identity,
            "provider": provider_text,
        }

    return {
        "ok": True,
        "activation": activation,
        "identity": identity,
        "provider": provider_text,
    }


def reserve_diagram_jazz_document(
    *,
    org_id: Any,
    project_id: Any,
    session_id: Any,
    provider: Any,
    contract_version: str = "",
    revision: int = 0,
    fingerprint: str = "",
    metadata: Optional[Dict[str, Any]] = None,
    actor_user_id: Optional[str] = None,
    env: Optional[Mapping[str, str]] = None,
    on_trace: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    ctx = _resolve_storage_contract_context(
        org_id=org_id,
        project_id=project_id,
        session_id=session_id,
        provider=provider,
        env=env,
        on_trace=on_trace,
    )
    if not ctx.get("ok"):
        return dict(ctx.get("blocked") or {})

    identity: DiagramJazzBackendIdentity = ctx["identity"]
    provider_text = _as_text(ctx["provider"])
    contract = _as_text(contract_version or DIAGRAM_JAZZ_BACKEND_CONTRACT_DRAFT["version"])
    try:
        doc = reserve_diagram_jazz_document_record(
            org_id=identity.org_id,
            project_id=identity.project_id,
            session_id=identity.session_id,
            scope_id=identity.scope_id,
            doc_alias=identity.doc_alias,
            provider=provider_text,
            contract_version=contract,
            revision=int(revision or 0),
            fingerprint=_as_text(fingerprint),
            metadata=metadata if isinstance(metadata, dict) else {},
            actor_user_id=actor_user_id,
        )
    except ValueError as exc:
        reason = _as_text(str(exc) or "diagram_jazz_storage_conflict")
        _emit_trace(
            on_trace,
            DIAGRAM_JAZZ_BACKEND_STORAGE_TRACE_MARKERS["mapping_conflict"],
            {"operation": "reserve_document", "reason": reason, "scope_id": identity.scope_id, "provider": provider_text},
        )
        return _blocked_with_status(reason, "Diagram Jazz document reservation failed.", _blocked_status_for_reason(reason))

    return {
        "ok": True,
        "status": 201 if bool(doc.get("created")) else 200,
        "blocked": "",
        "doc": doc,
        "identity": {
            "org_id": identity.org_id,
            "project_id": identity.project_id,
            "session_id": identity.session_id,
            "scope_id": identity.scope_id,
            "doc_alias": identity.doc_alias,
        },
    }


def create_or_resolve_diagram_jazz_mapping(
    *,
    org_id: Any,
    project_id: Any,
    session_id: Any,
    provider: Any,
    contract_version: str = "",
    revision: int = 0,
    fingerprint: str = "",
    metadata: Optional[Dict[str, Any]] = None,
    actor_user_id: Optional[str] = None,
    env: Optional[Mapping[str, str]] = None,
    on_trace: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    ctx = _resolve_storage_contract_context(
        org_id=org_id,
        project_id=project_id,
        session_id=session_id,
        provider=provider,
        env=env,
        on_trace=on_trace,
    )
    if not ctx.get("ok"):
        return dict(ctx.get("blocked") or {})

    identity: DiagramJazzBackendIdentity = ctx["identity"]
    provider_text = _as_text(ctx["provider"])
    contract = _as_text(contract_version or DIAGRAM_JAZZ_BACKEND_CONTRACT_DRAFT["version"])

    try:
        doc = reserve_diagram_jazz_document_record(
            org_id=identity.org_id,
            project_id=identity.project_id,
            session_id=identity.session_id,
            scope_id=identity.scope_id,
            doc_alias=identity.doc_alias,
            provider=provider_text,
            contract_version=contract,
            revision=int(revision or 0),
            fingerprint=_as_text(fingerprint),
            metadata=metadata if isinstance(metadata, dict) else {},
            actor_user_id=actor_user_id,
        )
        mapping = create_diagram_jazz_mapping_record(
            org_id=identity.org_id,
            project_id=identity.project_id,
            session_id=identity.session_id,
            scope_id=identity.scope_id,
            doc_alias=identity.doc_alias,
            doc_id=str(doc.get("doc_id") or ""),
            provider=provider_text,
            contract_version=contract,
            revision=int(revision or 0),
            fingerprint=_as_text(fingerprint),
            metadata=metadata if isinstance(metadata, dict) else {},
            actor_user_id=actor_user_id,
        )
        validation = validate_diagram_jazz_mapping_record(
            org_id=identity.org_id,
            project_id=identity.project_id,
            session_id=identity.session_id,
            scope_id=identity.scope_id,
            doc_alias=identity.doc_alias,
            provider=provider_text,
            mapping=mapping,
        )
        if not validation.get("ok"):
            reason = _as_text(validation.get("reason") or "diagram_jazz_mapping_invalid")
            raise ValueError(reason)
    except ValueError as exc:
        reason = _as_text(str(exc) or "diagram_jazz_storage_conflict")
        _emit_trace(
            on_trace,
            DIAGRAM_JAZZ_BACKEND_STORAGE_TRACE_MARKERS["mapping_conflict"],
            {"operation": "create_or_resolve_mapping", "reason": reason, "scope_id": identity.scope_id, "provider": provider_text},
        )
        return _blocked_with_status(reason, "Diagram Jazz mapping lifecycle failed.", _blocked_status_for_reason(reason))

    marker = (
        DIAGRAM_JAZZ_BACKEND_STORAGE_TRACE_MARKERS["mapping_created"]
        if bool(mapping.get("created"))
        else DIAGRAM_JAZZ_BACKEND_STORAGE_TRACE_MARKERS["mapping_resolved"]
    )
    _emit_trace(
        on_trace,
        marker,
        {
            "scope_id": identity.scope_id,
            "provider": provider_text,
            "doc_id": str(mapping.get("doc_id") or ""),
            "mapping_id": str(mapping.get("mapping_id") or ""),
            "created": 1 if bool(mapping.get("created")) else 0,
        },
    )
    return {
        "ok": True,
        "status": 201 if bool(mapping.get("created")) else 200,
        "blocked": "",
        "doc": doc,
        "mapping": mapping,
        "validation": validation,
        "identity": {
            "org_id": identity.org_id,
            "project_id": identity.project_id,
            "session_id": identity.session_id,
            "scope_id": identity.scope_id,
            "doc_alias": identity.doc_alias,
        },
    }


def get_diagram_jazz_mapping(
    *,
    org_id: Any,
    project_id: Any,
    session_id: Any,
    provider: Any,
    env: Optional[Mapping[str, str]] = None,
    on_trace: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    ctx = _resolve_storage_contract_context(
        org_id=org_id,
        project_id=project_id,
        session_id=session_id,
        provider=provider,
        env=env,
        on_trace=on_trace,
    )
    if not ctx.get("ok"):
        return dict(ctx.get("blocked") or {})

    identity: DiagramJazzBackendIdentity = ctx["identity"]
    provider_text = _as_text(ctx["provider"])
    mapping = get_diagram_jazz_mapping_record(
        org_id=identity.org_id,
        project_id=identity.project_id,
        session_id=identity.session_id,
        provider=provider_text,
    )
    if not mapping:
        return {
            "ok": True,
            "status": 404,
            "blocked": "",
            "exists": False,
            "mapping": None,
        }

    validation = validate_diagram_jazz_mapping_record(
        org_id=identity.org_id,
        project_id=identity.project_id,
        session_id=identity.session_id,
        scope_id=identity.scope_id,
        doc_alias=identity.doc_alias,
        provider=provider_text,
        mapping=mapping,
    )
    if not validation.get("ok"):
        reason = _as_text(validation.get("reason") or "diagram_jazz_mapping_invalid")
        _emit_trace(
            on_trace,
            DIAGRAM_JAZZ_BACKEND_STORAGE_TRACE_MARKERS["mapping_conflict"],
            {"operation": "get_mapping", "reason": reason, "scope_id": identity.scope_id, "provider": provider_text},
        )
        return _blocked_with_status(reason, "Diagram Jazz mapping validation failed.", _blocked_status_for_reason(reason))

    _emit_trace(
        on_trace,
        DIAGRAM_JAZZ_BACKEND_STORAGE_TRACE_MARKERS["mapping_resolved"],
        {
            "scope_id": identity.scope_id,
            "provider": provider_text,
            "doc_id": str(mapping.get("doc_id") or ""),
            "mapping_id": str(mapping.get("mapping_id") or ""),
            "created": 0,
        },
    )
    return {
        "ok": True,
        "status": 200,
        "blocked": "",
        "exists": True,
        "mapping": mapping,
        "validation": validation,
    }


def validate_diagram_jazz_mapping(
    *,
    org_id: Any,
    project_id: Any,
    session_id: Any,
    provider: Any,
    mapping: Optional[Dict[str, Any]] = None,
    env: Optional[Mapping[str, str]] = None,
    on_trace: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    ctx = _resolve_storage_contract_context(
        org_id=org_id,
        project_id=project_id,
        session_id=session_id,
        provider=provider,
        env=env,
        on_trace=on_trace,
    )
    if not ctx.get("ok"):
        return dict(ctx.get("blocked") or {})

    identity: DiagramJazzBackendIdentity = ctx["identity"]
    provider_text = _as_text(ctx["provider"])
    effective_mapping = mapping if isinstance(mapping, dict) else get_diagram_jazz_mapping_record(
        org_id=identity.org_id,
        project_id=identity.project_id,
        session_id=identity.session_id,
        provider=provider_text,
    )
    validation = validate_diagram_jazz_mapping_record(
        org_id=identity.org_id,
        project_id=identity.project_id,
        session_id=identity.session_id,
        scope_id=identity.scope_id,
        doc_alias=identity.doc_alias,
        provider=provider_text,
        mapping=effective_mapping,
    )
    if not validation.get("ok"):
        reason = _as_text(validation.get("reason") or "diagram_jazz_mapping_invalid")
        _emit_trace(
            on_trace,
            DIAGRAM_JAZZ_BACKEND_STORAGE_TRACE_MARKERS["mapping_conflict"],
            {"operation": "validate_mapping", "reason": reason, "scope_id": identity.scope_id, "provider": provider_text},
        )
        return _blocked_with_status(reason, "Diagram Jazz mapping is not valid.", _blocked_status_for_reason(reason))

    return {
        "ok": True,
        "status": 200,
        "blocked": "",
        "validation": validation,
    }


class DiagramJazzBackendContractDraftAdapter:
    """
    Default-off backend adapter for future Diagram->Jazz ownership.
    Adapter is production-grade internally, but remains inactive unless gate is ON.
    """

    def __init__(
        self,
        *,
        activation: DiagramJazzBackendActivation,
        on_trace: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    ) -> None:
        self.activation = activation
        self._on_trace = on_trace

    def _emit(self, event: str, payload: Optional[Dict[str, Any]] = None) -> None:
        if not callable(self._on_trace):
            return
        try:
            self._on_trace(str(event or "unknown"), dict(payload or {}))
        except Exception:
            return

    def _block_reason(self, identity: Optional[DiagramJazzBackendIdentity]) -> str:
        if self.activation.owner_rollback_active:
            return "diagram_cutover_rollback_active"
        if self.activation.unsupported:
            return _as_text(self.activation.unsupported_reason or "diagram_jazz_backend_unsupported")
        if _as_text(self.activation.owner_state or "") != "jazz_owner":
            return _as_text(self.activation.owner_blocked_reason or "diagram_jazz_backend_disabled")
        if not self.activation.jazz_mode:
            return _as_text(self.activation.owner_blocked_reason or "diagram_jazz_backend_disabled")
        if not identity or not identity.valid:
            return _as_text(getattr(identity, "invalid_reason", "") or "diagram_jazz_backend_identity_invalid")
        if not _as_text(self.activation.provider):
            return "diagram_jazz_backend_provider_missing"
        return ""

    def _resolve_mapping(
        self,
        *,
        identity: DiagramJazzBackendIdentity,
    ) -> Dict[str, Any]:
        provider_text = _as_text(self.activation.provider).lower()
        mapping = get_diagram_jazz_mapping_record(
            org_id=identity.org_id,
            project_id=identity.project_id,
            session_id=identity.session_id,
            provider=provider_text,
        )
        if not isinstance(mapping, dict):
            raise ValueError("diagram_jazz_mapping_missing")
        validation = validate_diagram_jazz_mapping_record(
            org_id=identity.org_id,
            project_id=identity.project_id,
            session_id=identity.session_id,
            scope_id=identity.scope_id,
            doc_alias=identity.doc_alias,
            provider=provider_text,
            mapping=mapping,
        )
        if not validation.get("ok"):
            raise ValueError(_as_text(validation.get("reason") or "diagram_jazz_mapping_invalid"))
        return mapping

    def _write_expectations(self, rev: Any) -> Dict[str, Any]:
        expected_revision: Optional[int] = None
        expected_fingerprint = ""
        if isinstance(rev, Mapping):
            rev_value = rev.get("expected_revision", rev.get("revision"))
            if rev_value is not None and str(rev_value).strip() != "":
                try:
                    expected_revision = int(rev_value)
                except Exception as exc:
                    raise ValueError("diagram_jazz_revision_invalid") from exc
            expected_fingerprint = _as_text(rev.get("expected_fingerprint", rev.get("fingerprint")))
        elif rev is not None and str(rev).strip() != "":
            try:
                expected_revision = int(rev)
            except Exception as exc:
                raise ValueError("diagram_jazz_revision_invalid") from exc
        return {
            "expected_revision": expected_revision,
            "expected_fingerprint": expected_fingerprint,
        }

    def read_durable_xml(
        self,
        *,
        identity: Optional[DiagramJazzBackendIdentity],
    ) -> Dict[str, Any]:
        self._emit(
            DIAGRAM_JAZZ_BACKEND_ADAPTER_TRACE_MARKERS["read_attempt"],
            {
                "scope_id": _as_text(getattr(identity, "scope_id", "")),
                "effective_mode": self.activation.effective_mode,
                "provider": _as_text(self.activation.provider).lower(),
            },
        )
        reason = self._block_reason(identity)
        if reason:
            self._emit(
                DIAGRAM_JAZZ_BACKEND_ADAPTER_TRACE_MARKERS["blocked"],
                {
                    "operation": "read",
                    "reason": reason,
                    "scope_id": _as_text(getattr(identity, "scope_id", "")),
                    "effective_mode": self.activation.effective_mode,
                },
            )
            self._emit(
                DIAGRAM_JAZZ_BACKEND_TRACE_MARKERS["attempt_blocked_without_contract"],
                {
                    "operation": "read",
                    "reason": reason,
                    "scope_id": _as_text(getattr(identity, "scope_id", "")),
                    "effective_mode": self.activation.effective_mode,
                },
            )
            return _blocked_with_status(
                reason,
                "Diagram Jazz backend adapter read blocked by contract gate/identity/provider rules.",
                _blocked_status_for_reason(reason),
            )

        assert identity is not None
        try:
            mapping = self._resolve_mapping(identity=identity)
            doc = read_diagram_jazz_document_payload_record(
                doc_id=str(mapping.get("doc_id") or ""),
                require_payload=True,
            )
        except ValueError as exc:
            reason = _as_text(str(exc) or "diagram_jazz_adapter_read_failed")
            marker = (
                DIAGRAM_JAZZ_BACKEND_ADAPTER_TRACE_MARKERS["conflict"]
                if ("conflict" in reason or "mismatch" in reason)
                else DIAGRAM_JAZZ_BACKEND_ADAPTER_TRACE_MARKERS["blocked"]
            )
            self._emit(
                marker,
                {
                    "operation": "read",
                    "reason": reason,
                    "scope_id": identity.scope_id,
                    "provider": _as_text(self.activation.provider).lower(),
                },
            )
            return _blocked_with_status(reason, "Diagram Jazz durable read failed.", _blocked_status_for_reason(reason))

        self._emit(
            DIAGRAM_JAZZ_BACKEND_ADAPTER_TRACE_MARKERS["read_success"],
            {
                "scope_id": identity.scope_id,
                "provider": _as_text(self.activation.provider).lower(),
                "doc_id": str(doc.get("doc_id") or ""),
                "mapping_id": str(mapping.get("mapping_id") or ""),
                "stored_revision": int(doc.get("revision") or 0),
                "bytes": int(doc.get("bpmn_xml_bytes") or 0),
            },
        )
        return {
            "ok": True,
            "status": 200,
            "blocked": "",
            "xml": str(doc.get("bpmn_xml") or ""),
            "durable_ack": {
                "doc_id": str(doc.get("doc_id") or ""),
                "doc_alias": str(doc.get("doc_alias") or ""),
                "scope_id": str(doc.get("scope_id") or ""),
                "provider": str(doc.get("provider") or ""),
                "contract_version": str(doc.get("contract_version") or ""),
                "stored_revision": int(doc.get("revision") or 0),
                "stored_fingerprint": str(doc.get("fingerprint") or ""),
                "updated_at": int(doc.get("updated_at") or 0),
                "payload_updated_at": int(doc.get("payload_updated_at") or 0),
                "mapping_id": str(mapping.get("mapping_id") or ""),
            },
        }

    def write_durable_xml(
        self,
        *,
        identity: Optional[DiagramJazzBackendIdentity],
        xml: Any,
        rev: Any,
    ) -> Dict[str, Any]:
        self._emit(
            DIAGRAM_JAZZ_BACKEND_ADAPTER_TRACE_MARKERS["write_attempt"],
            {
                "scope_id": _as_text(getattr(identity, "scope_id", "")),
                "effective_mode": self.activation.effective_mode,
                "provider": _as_text(self.activation.provider).lower(),
            },
        )
        reason = self._block_reason(identity)
        if reason:
            self._emit(
                DIAGRAM_JAZZ_BACKEND_ADAPTER_TRACE_MARKERS["blocked"],
                {
                    "operation": "write",
                    "reason": reason,
                    "scope_id": _as_text(getattr(identity, "scope_id", "")),
                    "effective_mode": self.activation.effective_mode,
                },
            )
            self._emit(
                DIAGRAM_JAZZ_BACKEND_TRACE_MARKERS["attempt_blocked_without_contract"],
                {
                    "operation": "write",
                    "reason": reason,
                    "scope_id": _as_text(getattr(identity, "scope_id", "")),
                    "effective_mode": self.activation.effective_mode,
                },
            )
            return _blocked_with_status(
                reason,
                "Diagram Jazz backend adapter write blocked by contract gate/identity/provider rules.",
                _blocked_status_for_reason(reason),
            )

        assert identity is not None
        try:
            mapping = self._resolve_mapping(identity=identity)
            expectations = self._write_expectations(rev)
            write_result = write_diagram_jazz_document_payload_record(
                doc_id=str(mapping.get("doc_id") or ""),
                bpmn_xml=_as_raw_text(xml),
                expected_revision=expectations.get("expected_revision"),
                expected_fingerprint=_as_text(expectations.get("expected_fingerprint")),
                contract_version=_as_text(mapping.get("contract_version") or ""),
                storage_mode="active",
                actor_user_id="diagram_jazz_adapter",
            )
            updated_doc = dict(write_result.get("doc") or {})
            updated_mapping = dict(write_result.get("mapping") or {})
        except ValueError as exc:
            reason = _as_text(str(exc) or "diagram_jazz_adapter_write_failed")
            marker = (
                DIAGRAM_JAZZ_BACKEND_ADAPTER_TRACE_MARKERS["conflict"]
                if ("conflict" in reason or "mismatch" in reason)
                else DIAGRAM_JAZZ_BACKEND_ADAPTER_TRACE_MARKERS["blocked"]
            )
            self._emit(
                marker,
                {
                    "operation": "write",
                    "reason": reason,
                    "scope_id": identity.scope_id,
                    "provider": _as_text(self.activation.provider).lower(),
                },
            )
            return _blocked_with_status(reason, "Diagram Jazz durable write failed.", _blocked_status_for_reason(reason))

        self._emit(
            DIAGRAM_JAZZ_BACKEND_ADAPTER_TRACE_MARKERS["write_success"],
            {
                "scope_id": identity.scope_id,
                "provider": _as_text(self.activation.provider).lower(),
                "doc_id": str(updated_doc.get("doc_id") or ""),
                "mapping_id": str(updated_mapping.get("mapping_id") or ""),
                "stored_revision": int(updated_doc.get("revision") or 0),
                "bytes": int(updated_doc.get("bpmn_xml_bytes") or 0),
            },
        )
        return {
            "ok": True,
            "status": 200,
            "blocked": "",
            "durable_ack": {
                "doc_id": str(updated_doc.get("doc_id") or ""),
                "doc_alias": str(updated_doc.get("doc_alias") or ""),
                "scope_id": str(updated_doc.get("scope_id") or ""),
                "provider": str(updated_doc.get("provider") or ""),
                "contract_version": str(updated_doc.get("contract_version") or ""),
                "stored_revision": int(updated_doc.get("revision") or 0),
                "stored_fingerprint": str(updated_doc.get("fingerprint") or ""),
                "updated_at": int(updated_doc.get("updated_at") or 0),
                "payload_updated_at": int(updated_doc.get("payload_updated_at") or 0),
                "mapping_id": str(updated_mapping.get("mapping_id") or ""),
            },
        }
