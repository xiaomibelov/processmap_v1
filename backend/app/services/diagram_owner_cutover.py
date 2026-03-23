from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional


DIAGRAM_OWNER_CONTRACT_DRAFT = {
    "version": "diagram-owner-cutover-contract-draft-v1",
    "states": (
        "legacy_owner",
        "jazz_owner",
        "cutover_blocked",
        "rollback_to_legacy",
    ),
    "default_owner": "legacy_owner",
    "cutover_law": "single_owner_switch_without_dual_read_write",
    "rollback_law": "explicit_rollback_trigger_restores_legacy_owner",
}

DIAGRAM_OWNER_TRACE_MARKERS = {
    "owner_state": "diagram_owner_state",
    "cutover_attempt": "diagram_cutover_attempt",
    "cutover_blocked": "diagram_cutover_blocked",
    "cutover_success": "diagram_cutover_success",
    "cutover_rollback": "diagram_cutover_rollback",
    "cutover_invariant_violation": "diagram_cutover_invariant_violation",
}


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_bool(value: Any, default: bool = False) -> bool:
    text = _as_text(value).lower()
    if not text:
        return default
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _normalize_owner_state(raw: Any) -> str:
    text = _as_text(raw).lower()
    if text in {"", "legacy", "legacy_owner"}:
        return "legacy_owner"
    if text in {"jazz", "jazz_owner"}:
        return "jazz_owner"
    if text in {"rollback", "rollback_to_legacy"}:
        return "rollback_to_legacy"
    return "cutover_blocked"


def _normalize_mode(raw: Any) -> str:
    return "jazz" if _as_text(raw).lower() == "jazz" else "legacy"


@dataclass(frozen=True)
class DiagramOwnerCutoverState:
    requested_state: str
    effective_state: str
    diagram_owner: str
    blocked_reason: str
    rollback_triggered: bool
    source: str
    switch_approved: bool
    preconditions: Dict[str, int]
    scoped_gate_match: bool
    scoped_gate_scope: str
    scoped_gate_blocked_reason: str
    scoped_gate_operator: str

    @property
    def jazz_owner_active(self) -> bool:
        return self.diagram_owner == "jazz_owner" and self.effective_state == "jazz_owner"


def _first_failed_precondition_reason(preconditions: Dict[str, int]) -> str:
    ordered = (
        ("owner_switch_approved", "diagram_cutover_blocked_owner_switch_not_approved"),
        ("cutover_switch_enabled", "diagram_cutover_blocked_switch_not_enabled"),
        ("backend_gate_ready", "diagram_cutover_blocked_backend_gate_not_ready"),
        ("backend_mode_jazz", "diagram_cutover_blocked_backend_mode_not_jazz"),
        ("provider_ready", "diagram_cutover_blocked_provider_missing"),
        ("api_ready", "diagram_cutover_blocked_api_not_ready"),
        ("rollback_ready", "diagram_cutover_blocked_rollback_not_ready"),
        ("observability_ready", "diagram_cutover_blocked_observability_not_ready"),
        ("contract_version_match", "diagram_cutover_blocked_contract_mismatch"),
    )
    for key, reason in ordered:
        if int(preconditions.get(key, 0)) == 0:
            return reason
    return ""


def _scope_from_parts(org_id: Any, project_id: Any, session_id: Any) -> str:
    org = _as_text(org_id)
    project = _as_text(project_id)
    session = _as_text(session_id)
    if not org or not project or not session:
        return ""
    return f"{org}::{project}::{session}"


def _parse_scope_allowlist(raw: Any) -> Dict[str, Any]:
    text = _as_text(raw)
    if not text:
        return {"present": False, "malformed": False, "entries": []}
    tokens = []
    for part in text.replace("\n", ",").replace(";", ",").split(","):
        token = _as_text(part)
        if token:
            tokens.append(token)
    entries = []
    malformed = False
    for token in tokens:
        scope_part, sep, operator_part = token.partition("@")
        scope_text = _as_text(scope_part)
        operator_text = _as_text(operator_part)
        scope_chunks = [chunk.strip() for chunk in scope_text.split("::")]
        if len(scope_chunks) != 3 or any(not chunk for chunk in scope_chunks):
            malformed = True
            continue
        if sep and not operator_text:
            malformed = True
            continue
        entries.append({
            "scope_id": "::".join(scope_chunks),
            "operator_id": operator_text,
        })
    if not entries:
        malformed = True
    return {
        "present": True,
        "malformed": malformed,
        "entries": entries,
    }


def _evaluate_scoped_gate(
    source_env: Mapping[str, str],
    *,
    scope_id: str,
    operator_id: str,
) -> Dict[str, Any]:
    parsed = _parse_scope_allowlist(source_env.get("DIAGRAM_JAZZ_SCOPE_ALLOWLIST"))
    if not parsed.get("present"):
        return {
            "match": False,
            "reason": "diagram_cutover_blocked_scope_allowlist_missing",
            "scope_id": scope_id,
            "operator_id": operator_id,
        }
    if parsed.get("malformed"):
        return {
            "match": False,
            "reason": "diagram_cutover_blocked_scope_allowlist_malformed",
            "scope_id": scope_id,
            "operator_id": operator_id,
        }
    if not scope_id:
        return {
            "match": False,
            "reason": "diagram_cutover_blocked_scope_context_missing",
            "scope_id": scope_id,
            "operator_id": operator_id,
        }
    entries = list(parsed.get("entries") or [])
    matched_scope = [entry for entry in entries if _as_text(entry.get("scope_id")) == scope_id]
    if not matched_scope:
        return {
            "match": False,
            "reason": "diagram_cutover_blocked_scope_not_allowed",
            "scope_id": scope_id,
            "operator_id": operator_id,
        }
    if any(not _as_text(entry.get("operator_id")) for entry in matched_scope):
        return {
            "match": True,
            "reason": "",
            "scope_id": scope_id,
            "operator_id": operator_id,
        }
    if not operator_id:
        return {
            "match": False,
            "reason": "diagram_cutover_blocked_operator_context_missing",
            "scope_id": scope_id,
            "operator_id": operator_id,
        }
    if not any(_as_text(entry.get("operator_id")) == operator_id for entry in matched_scope):
        return {
            "match": False,
            "reason": "diagram_cutover_blocked_operator_not_allowed",
            "scope_id": scope_id,
            "operator_id": operator_id,
        }
    return {
        "match": True,
        "reason": "",
        "scope_id": scope_id,
        "operator_id": operator_id,
    }


def resolve_diagram_owner_cutover_state(
    env: Optional[Mapping[str, str]] = None,
    *,
    org_id: Any = "",
    project_id: Any = "",
    session_id: Any = "",
    scope_id: Any = "",
    operator_id: Any = "",
) -> DiagramOwnerCutoverState:
    source_env = env if isinstance(env, Mapping) else os.environ
    requested_raw = source_env.get("DIAGRAM_OWNER_STATE", "")
    requested_state = _normalize_owner_state(requested_raw)
    source = "env" if _as_text(requested_raw) else "default"

    cutover_switch_enabled = _as_bool(source_env.get("DIAGRAM_JAZZ_CUTOVER_ENABLE"), False)
    owner_switch_approved = _as_bool(source_env.get("DIAGRAM_JAZZ_OWNER_SWITCH_APPROVED"), False)
    backend_gate_ready = _as_bool(source_env.get("DIAGRAM_JAZZ_BACKEND_CONTRACT_DRAFT"), False)
    backend_mode_jazz = _normalize_mode(source_env.get("DIAGRAM_JAZZ_BACKEND_MODE")) == "jazz"
    provider_ready = _as_text(source_env.get("DIAGRAM_JAZZ_BACKEND_PROVIDER")).lower() not in {"", "disabled"}
    api_ready = _as_bool(source_env.get("DIAGRAM_JAZZ_API_READY"), False)
    rollback_ready = _as_bool(source_env.get("DIAGRAM_JAZZ_ROLLBACK_READY"), False)
    rollback_trigger = _as_bool(source_env.get("DIAGRAM_JAZZ_ROLLBACK_TRIGGER"), False)
    observability_ready = _as_bool(source_env.get("DIAGRAM_JAZZ_OBSERVABILITY_READY"), False)
    required_contract_version = _as_text(
        source_env.get("DIAGRAM_JAZZ_REQUIRED_CONTRACT_VERSION")
        or "diagram-jazz-backend-contract-draft-v1"
    )
    active_contract_version = _as_text(
        source_env.get("DIAGRAM_JAZZ_CONTRACT_VERSION")
        or source_env.get("DIAGRAM_JAZZ_BACKEND_CONTRACT_VERSION")
    )
    contract_version_match = bool(active_contract_version and required_contract_version and active_contract_version == required_contract_version)

    preconditions = {
        "owner_switch_approved": 1 if owner_switch_approved else 0,
        "cutover_switch_enabled": 1 if cutover_switch_enabled else 0,
        "backend_gate_ready": 1 if backend_gate_ready else 0,
        "backend_mode_jazz": 1 if backend_mode_jazz else 0,
        "provider_ready": 1 if provider_ready else 0,
        "api_ready": 1 if api_ready else 0,
        "rollback_ready": 1 if rollback_ready else 0,
        "observability_ready": 1 if observability_ready else 0,
        "contract_version_match": 1 if contract_version_match else 0,
    }
    effective_scope = _as_text(scope_id) or _scope_from_parts(org_id, project_id, session_id)
    scoped_operator = _as_text(operator_id)
    scoped_gate = {
        "match": False,
        "reason": "",
        "scope_id": effective_scope,
        "operator_id": scoped_operator,
    }

    if requested_state == "cutover_blocked":
        return DiagramOwnerCutoverState(
            requested_state="cutover_blocked",
            effective_state="cutover_blocked",
            diagram_owner="legacy_owner",
            blocked_reason="diagram_cutover_state_invalid",
            rollback_triggered=False,
            source=source,
            switch_approved=owner_switch_approved,
            preconditions=preconditions,
            scoped_gate_match=False,
            scoped_gate_scope=effective_scope,
            scoped_gate_blocked_reason="diagram_cutover_state_invalid",
            scoped_gate_operator=scoped_operator,
        )

    if requested_state == "rollback_to_legacy":
        if not rollback_ready:
            return DiagramOwnerCutoverState(
                requested_state=requested_state,
                effective_state="cutover_blocked",
                diagram_owner="legacy_owner",
                blocked_reason="diagram_cutover_rollback_not_ready",
                rollback_triggered=False,
                source=source,
                switch_approved=owner_switch_approved,
                preconditions=preconditions,
                scoped_gate_match=False,
                scoped_gate_scope=effective_scope,
                scoped_gate_blocked_reason="",
                scoped_gate_operator=scoped_operator,
            )
        if not rollback_trigger:
            return DiagramOwnerCutoverState(
                requested_state=requested_state,
                effective_state="cutover_blocked",
                diagram_owner="legacy_owner",
                blocked_reason="diagram_cutover_rollback_trigger_missing",
                rollback_triggered=False,
                source=source,
                switch_approved=owner_switch_approved,
                preconditions=preconditions,
                scoped_gate_match=False,
                scoped_gate_scope=effective_scope,
                scoped_gate_blocked_reason="",
                scoped_gate_operator=scoped_operator,
            )
        return DiagramOwnerCutoverState(
            requested_state=requested_state,
            effective_state="rollback_to_legacy",
            diagram_owner="legacy_owner",
            blocked_reason="",
            rollback_triggered=True,
            source=source,
            switch_approved=owner_switch_approved,
            preconditions=preconditions,
            scoped_gate_match=False,
            scoped_gate_scope=effective_scope,
            scoped_gate_blocked_reason="",
            scoped_gate_operator=scoped_operator,
        )

    if requested_state == "legacy_owner":
        return DiagramOwnerCutoverState(
            requested_state=requested_state,
            effective_state="legacy_owner",
            diagram_owner="legacy_owner",
            blocked_reason="",
            rollback_triggered=False,
            source=source,
            switch_approved=owner_switch_approved,
            preconditions=preconditions,
            scoped_gate_match=False,
            scoped_gate_scope=effective_scope,
            scoped_gate_blocked_reason="",
            scoped_gate_operator=scoped_operator,
        )

    # requested_state == "jazz_owner"
    if rollback_trigger:
        return DiagramOwnerCutoverState(
            requested_state=requested_state,
            effective_state="cutover_blocked",
            diagram_owner="legacy_owner",
            blocked_reason="diagram_cutover_blocked_rollback_triggered",
            rollback_triggered=True,
            source=source,
            switch_approved=owner_switch_approved,
            preconditions=preconditions,
            scoped_gate_match=False,
            scoped_gate_scope=effective_scope,
            scoped_gate_blocked_reason="diagram_cutover_blocked_rollback_triggered",
            scoped_gate_operator=scoped_operator,
        )

    scoped_gate = _evaluate_scoped_gate(
        source_env,
        scope_id=effective_scope,
        operator_id=scoped_operator,
    )
    preconditions["scoped_gate_match"] = 1 if bool(scoped_gate.get("match")) else 0
    if not bool(scoped_gate.get("match")):
        reason = _as_text(scoped_gate.get("reason") or "diagram_cutover_blocked_scope_not_allowed")
        return DiagramOwnerCutoverState(
            requested_state=requested_state,
            effective_state="cutover_blocked",
            diagram_owner="legacy_owner",
            blocked_reason=reason,
            rollback_triggered=False,
            source=source,
            switch_approved=owner_switch_approved,
            preconditions=preconditions,
            scoped_gate_match=False,
            scoped_gate_scope=effective_scope,
            scoped_gate_blocked_reason=reason,
            scoped_gate_operator=scoped_operator,
        )

    blocked_reason = _first_failed_precondition_reason(preconditions)
    if blocked_reason:
        return DiagramOwnerCutoverState(
            requested_state=requested_state,
            effective_state="cutover_blocked",
            diagram_owner="legacy_owner",
            blocked_reason=blocked_reason,
            rollback_triggered=False,
            source=source,
            switch_approved=owner_switch_approved,
            preconditions=preconditions,
            scoped_gate_match=True,
            scoped_gate_scope=effective_scope,
            scoped_gate_blocked_reason="",
            scoped_gate_operator=scoped_operator,
        )

    return DiagramOwnerCutoverState(
        requested_state=requested_state,
        effective_state="jazz_owner",
        diagram_owner="jazz_owner",
        blocked_reason="",
        rollback_triggered=False,
        source=source,
        switch_approved=owner_switch_approved,
        preconditions=preconditions,
        scoped_gate_match=True,
        scoped_gate_scope=effective_scope,
        scoped_gate_blocked_reason="",
        scoped_gate_operator=scoped_operator,
    )


def owner_path_block_reason(state: DiagramOwnerCutoverState, path_kind: str) -> str:
    path = _as_text(path_kind).lower()
    if path not in {"legacy", "jazz"}:
        return "diagram_cutover_invariant_violation_unknown_path"
    if state.effective_state == "cutover_blocked":
        return _as_text(state.blocked_reason or "diagram_cutover_blocked")
    if state.rollback_triggered and path == "jazz":
        return "diagram_cutover_rollback_active"
    if state.diagram_owner == "legacy_owner" and path == "jazz":
        return "diagram_cutover_owner_legacy_path_locked"
    if state.diagram_owner == "jazz_owner" and path == "legacy":
        return "diagram_cutover_owner_jazz_path_locked"
    return ""
