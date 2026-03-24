from __future__ import annotations

import argparse
import json
import time
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Mapping, Optional

from app.routers.diagram_jazz import (
    DiagramJazzWriteIn,
    diagram_jazz_api_read_contract,
    diagram_jazz_api_write_contract,
)
from app.services.diagram_owner_cutover import (
    owner_path_block_reason,
    resolve_diagram_owner_cutover_state,
)
from app.services.diagram_jazz_contract import create_or_resolve_diagram_jazz_mapping


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _base_env_default_off() -> Dict[str, str]:
    return {}


def _base_env_jazz_ready(scope: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    env = {
        "DIAGRAM_OWNER_STATE": "jazz_owner",
        "DIAGRAM_JAZZ_OWNER_SWITCH_APPROVED": "1",
        "DIAGRAM_JAZZ_CUTOVER_ENABLE": "1",
        "DIAGRAM_JAZZ_BACKEND_CONTRACT_DRAFT": "1",
        "DIAGRAM_JAZZ_BACKEND_MODE": "jazz",
        "DIAGRAM_JAZZ_BACKEND_PROVIDER": "zeebe",
        "DIAGRAM_JAZZ_API_READY": "1",
        "DIAGRAM_JAZZ_ROLLBACK_READY": "1",
        "DIAGRAM_JAZZ_OBSERVABILITY_READY": "1",
        "DIAGRAM_JAZZ_CONTRACT_VERSION": "diagram-jazz-backend-contract-draft-v1",
        "DIAGRAM_JAZZ_REQUIRED_CONTRACT_VERSION": "diagram-jazz-backend-contract-draft-v1",
    }
    if isinstance(scope, dict):
        org_id = _as_text(scope.get("org_id"))
        project_id = _as_text(scope.get("project_id"))
        session_id = _as_text(scope.get("session_id"))
        if org_id and project_id and session_id:
            env["DIAGRAM_JAZZ_SCOPE_ALLOWLIST"] = f"{org_id}::{project_id}::{session_id}"
    return env


def _trace_meta(correlation_id: str, operation: str) -> Dict[str, str]:
    return {
        "client_trace_id": f"drill-{operation}-{uuid.uuid4().hex[:8]}",
        "correlation_id": correlation_id,
        "client_layer": "fe",
        "client_operation": operation,
    }


def _capture_markers() -> tuple[List[Dict[str, Any]], Callable[[str, Dict[str, Any]], None]]:
    markers: List[Dict[str, Any]] = []

    def _on_marker(event: str, payload: Dict[str, Any]) -> None:
        markers.append({
            "event": _as_text(event),
            "payload": dict(payload or {}),
        })

    return markers, _on_marker


def _assert(condition: bool, message: str, failures: List[str]) -> None:
    if not condition:
        failures.append(message)


def _events(markers: List[Dict[str, Any]]) -> List[str]:
    return [_as_text(item.get("event")) for item in markers]


def _new_scope(seed: str) -> Dict[str, str]:
    suffix = f"{seed}_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    return {
        "org_id": f"drill_org_{suffix}",
        "project_id": f"drill_project_{suffix}",
        "session_id": f"drill_session_{suffix}",
    }


@dataclass
class DrillResult:
    scenario: str
    passed: bool
    failures: List[str]
    detail: Dict[str, Any]


def _scenario_01_requested_jazz_before_activation() -> DrillResult:
    """
    1) rollback from requested jazz_owner before activation completes
    """
    failures: List[str] = []
    scope = _new_scope("s01")
    env_cutover = _base_env_jazz_ready(scope)
    env_cutover["DIAGRAM_JAZZ_OWNER_SWITCH_APPROVED"] = "0"

    state_cutover = resolve_diagram_owner_cutover_state(
        env_cutover,
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        session_id=scope["session_id"],
    )
    _assert(state_cutover.effective_state == "cutover_blocked", "s01: expected cutover_blocked before rollback", failures)
    _assert(state_cutover.diagram_owner == "legacy_owner", "s01: owner must stay legacy before rollback", failures)

    markers_before, on_marker_before = _capture_markers()
    read_before = diagram_jazz_api_read_contract(
        session_id=scope["session_id"],
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        provider="zeebe",
        env=env_cutover,
        request_trace=_trace_meta("drill-corr-s01-before", "read_attempt"),
        on_marker=on_marker_before,
    )
    _assert(int(read_before.get("status") or 0) in {400, 409, 503}, "s01: expected blocked status before rollback", failures)
    _assert(
        _as_text(read_before.get("blocked")) in {
            "diagram_cutover_blocked_owner_switch_not_approved",
            "diagram_jazz_provider_mismatch",
        },
        "s01: expected explicit blocked reason before rollback",
        failures,
    )

    env_rollback = dict(env_cutover)
    env_rollback["DIAGRAM_OWNER_STATE"] = "rollback_to_legacy"
    env_rollback["DIAGRAM_JAZZ_ROLLBACK_READY"] = "1"
    env_rollback["DIAGRAM_JAZZ_ROLLBACK_TRIGGER"] = "1"
    state_after = resolve_diagram_owner_cutover_state(
        env_rollback,
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        session_id=scope["session_id"],
    )
    _assert(state_after.effective_state == "rollback_to_legacy", "s01: expected rollback_to_legacy effective state", failures)
    _assert(state_after.diagram_owner == "legacy_owner", "s01: rollback must resolve owner to legacy", failures)
    _assert(state_after.rollback_triggered is True, "s01: rollback trigger must be true", failures)
    _assert(owner_path_block_reason(state_after, "jazz") == "diagram_cutover_rollback_active", "s01: jazz path must be blocked after rollback", failures)

    markers_after, on_marker_after = _capture_markers()
    read_after = diagram_jazz_api_read_contract(
        session_id=scope["session_id"],
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        provider="zeebe",
        env=env_rollback,
        request_trace=_trace_meta("drill-corr-s01-after", "read_attempt"),
        on_marker=on_marker_after,
    )
    _assert(int(read_after.get("status") or 0) in {400, 409}, "s01: expected blocked status after rollback", failures)
    _assert(_as_text(read_after.get("blocked")) == "diagram_cutover_rollback_active", "s01: expected rollback_active block", failures)
    _assert("diagram_cutover_rollback" in _events(markers_after), "s01: rollback marker missing", failures)

    return DrillResult(
        scenario="s01_requested_jazz_before_activation_then_rollback",
        passed=not failures,
        failures=failures,
        detail={
            "state_before": {
                "requested_state": state_cutover.requested_state,
                "effective_state": state_cutover.effective_state,
                "diagram_owner": state_cutover.diagram_owner,
                "blocked_reason": state_cutover.blocked_reason,
            },
            "state_after": {
                "requested_state": state_after.requested_state,
                "effective_state": state_after.effective_state,
                "diagram_owner": state_after.diagram_owner,
                "blocked_reason": state_after.blocked_reason,
                "rollback_triggered": state_after.rollback_triggered,
            },
            "read_before": {
                "status": int(read_before.get("status") or 0),
                "blocked": _as_text(read_before.get("blocked")),
            },
            "read_after": {
                "status": int(read_after.get("status") or 0),
                "blocked": _as_text(read_after.get("blocked")),
            },
            "markers_before": _events(markers_before),
            "markers_after": _events(markers_after),
        },
    )


def _scenario_02_rollback_when_cutover_blocked() -> DrillResult:
    """
    2) rollback when owner state is cutover_blocked
    """
    failures: List[str] = []
    scope = _new_scope("s02")
    env_cutover_blocked = _base_env_jazz_ready(scope)
    env_cutover_blocked["DIAGRAM_JAZZ_API_READY"] = "0"
    state_blocked = resolve_diagram_owner_cutover_state(
        env_cutover_blocked,
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        session_id=scope["session_id"],
    )
    _assert(state_blocked.effective_state == "cutover_blocked", "s02: expected cutover_blocked", failures)
    _assert(state_blocked.blocked_reason == "diagram_cutover_blocked_api_not_ready", "s02: expected api_not_ready reason", failures)

    env_rollback = dict(env_cutover_blocked)
    env_rollback["DIAGRAM_OWNER_STATE"] = "rollback_to_legacy"
    env_rollback["DIAGRAM_JAZZ_ROLLBACK_READY"] = "1"
    env_rollback["DIAGRAM_JAZZ_ROLLBACK_TRIGGER"] = "1"
    state_rollback = resolve_diagram_owner_cutover_state(
        env_rollback,
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        session_id=scope["session_id"],
    )
    _assert(state_rollback.effective_state == "rollback_to_legacy", "s02: expected rollback_to_legacy", failures)
    _assert(state_rollback.diagram_owner == "legacy_owner", "s02: owner must be legacy", failures)

    markers, on_marker = _capture_markers()
    out = diagram_jazz_api_write_contract(
        session_id=scope["session_id"],
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        payload=DiagramJazzWriteIn(xml="<bpmn:definitions />"),
        provider_query="zeebe",
        env=env_rollback,
        request_trace=_trace_meta("drill-corr-s02", "write_attempt"),
        on_marker=on_marker,
    )
    _assert(int(out.get("status") or 0) in {400, 409}, "s02: expected rollback blocked status", failures)
    _assert(_as_text(out.get("blocked")) == "diagram_cutover_rollback_active", "s02: expected rollback_active reason", failures)
    ev = _events(markers)
    _assert("diagram_cutover_rollback" in ev, "s02: missing cutover_rollback marker", failures)
    _assert("diagram_jazz_api_write_attempt" in ev, "s02: missing api write attempt marker", failures)

    return DrillResult(
        scenario="s02_rollback_when_cutover_blocked",
        passed=not failures,
        failures=failures,
        detail={
            "state_blocked": {
                "effective_state": state_blocked.effective_state,
                "blocked_reason": state_blocked.blocked_reason,
            },
            "state_rollback": {
                "effective_state": state_rollback.effective_state,
                "diagram_owner": state_rollback.diagram_owner,
                "rollback_triggered": state_rollback.rollback_triggered,
            },
            "write": {
                "status": int(out.get("status") or 0),
                "blocked": _as_text(out.get("blocked")),
            },
            "markers": ev,
        },
    )


def _scenario_03_explicit_rollback_trigger() -> DrillResult:
    """
    3) rollback when rollback trigger set explicitly
    """
    failures: List[str] = []
    scope = _new_scope("s03")
    env_rollback = _base_env_jazz_ready(scope)
    env_rollback["DIAGRAM_OWNER_STATE"] = "rollback_to_legacy"
    env_rollback["DIAGRAM_JAZZ_ROLLBACK_READY"] = "1"
    env_rollback["DIAGRAM_JAZZ_ROLLBACK_TRIGGER"] = "1"

    state = resolve_diagram_owner_cutover_state(
        env_rollback,
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        session_id=scope["session_id"],
    )
    _assert(state.effective_state == "rollback_to_legacy", "s03: expected rollback_to_legacy", failures)
    _assert(state.diagram_owner == "legacy_owner", "s03: owner must be legacy", failures)
    _assert(owner_path_block_reason(state, "jazz") == "diagram_cutover_rollback_active", "s03: jazz path should be locked", failures)

    markers, on_marker = _capture_markers()
    out = diagram_jazz_api_read_contract(
        session_id=scope["session_id"],
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        provider="zeebe",
        env=env_rollback,
        request_trace=_trace_meta("drill-corr-s03", "read_attempt"),
        on_marker=on_marker,
    )
    _assert(int(out.get("status") or 0) in {400, 409}, "s03: expected blocked read after rollback", failures)
    _assert(_as_text(out.get("blocked")) == "diagram_cutover_rollback_active", "s03: expected rollback_active reason", failures)

    return DrillResult(
        scenario="s03_explicit_rollback_trigger",
        passed=not failures,
        failures=failures,
        detail={
            "state": {
                "effective_state": state.effective_state,
                "diagram_owner": state.diagram_owner,
                "rollback_triggered": state.rollback_triggered,
            },
            "read": {
                "status": int(out.get("status") or 0),
                "blocked": _as_text(out.get("blocked")),
            },
            "markers": _events(markers),
        },
    )


def _scenario_04_rollback_after_write_conflict() -> DrillResult:
    """
    4) rollback after simulated API/write conflict
    """
    failures: List[str] = []
    scope = _new_scope("s04")
    env_jazz = _base_env_jazz_ready(scope)

    mapping = create_or_resolve_diagram_jazz_mapping(
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        session_id=scope["session_id"],
        provider="zeebe",
        env=env_jazz,
    )
    _assert(bool(mapping.get("ok")), "s04: mapping precondition must be resolvable", failures)

    markers_write_ok, on_write_ok = _capture_markers()
    write_ok = diagram_jazz_api_write_contract(
        session_id=scope["session_id"],
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        payload=DiagramJazzWriteIn(xml="<bpmn:definitions id='s04_ok' />"),
        provider_query="zeebe",
        env=env_jazz,
        request_trace=_trace_meta("drill-corr-s04-ok", "write_attempt"),
        on_marker=on_write_ok,
    )
    _assert(bool(write_ok.get("ok")), "s04: first write must succeed in jazz-ready env", failures)
    ack = dict(write_ok.get("ack") or {})
    stored_rev = int(ack.get("stored_revision") or 0)
    _assert(stored_rev >= 1, "s04: stored revision should be >= 1", failures)

    markers_conflict, on_conflict = _capture_markers()
    write_conflict = diagram_jazz_api_write_contract(
        session_id=scope["session_id"],
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        payload=DiagramJazzWriteIn(
            xml="<bpmn:definitions id='s04_conflict' />",
            expected_revision=0,
            expected_fingerprint="invalid",
        ),
        provider_query="zeebe",
        env=env_jazz,
        request_trace=_trace_meta("drill-corr-s04-conflict", "write_attempt"),
        on_marker=on_conflict,
    )
    _assert(int(write_conflict.get("status") or 0) == 409, "s04: expected 409 conflict", failures)
    _assert(
        _as_text(write_conflict.get("blocked")) in {"diagram_jazz_revision_conflict", "diagram_jazz_fingerprint_conflict"},
        "s04: expected revision/fingerprint conflict reason",
        failures,
    )
    _assert("diagram_jazz_api_conflict" in _events(markers_conflict), "s04: missing api conflict marker", failures)
    _assert("diagram_jazz_adapter_conflict" in _events(markers_conflict), "s04: missing adapter conflict marker", failures)

    env_rollback = dict(env_jazz)
    env_rollback["DIAGRAM_OWNER_STATE"] = "rollback_to_legacy"
    env_rollback["DIAGRAM_JAZZ_ROLLBACK_TRIGGER"] = "1"
    env_rollback["DIAGRAM_JAZZ_ROLLBACK_READY"] = "1"
    state_after = resolve_diagram_owner_cutover_state(
        env_rollback,
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        session_id=scope["session_id"],
    )
    _assert(state_after.diagram_owner == "legacy_owner", "s04: rollback must restore legacy owner", failures)

    markers_after, on_after = _capture_markers()
    read_after = diagram_jazz_api_read_contract(
        session_id=scope["session_id"],
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        provider="zeebe",
        env=env_rollback,
        request_trace=_trace_meta("drill-corr-s04-after", "read_attempt"),
        on_marker=on_after,
    )
    _assert(int(read_after.get("status") or 0) in {400, 409}, "s04: expected blocked read after rollback", failures)
    _assert(_as_text(read_after.get("blocked")) == "diagram_cutover_rollback_active", "s04: expected rollback active block", failures)

    return DrillResult(
        scenario="s04_rollback_after_write_conflict",
        passed=not failures,
        failures=failures,
        detail={
            "write_ok": {
                "status": int(write_ok.get("status") or 0),
                "stored_revision": stored_rev,
            },
            "write_conflict": {
                "status": int(write_conflict.get("status") or 0),
                "blocked": _as_text(write_conflict.get("blocked")),
            },
            "state_after": {
                "effective_state": state_after.effective_state,
                "diagram_owner": state_after.diagram_owner,
                "rollback_triggered": state_after.rollback_triggered,
            },
            "read_after": {
                "status": int(read_after.get("status") or 0),
                "blocked": _as_text(read_after.get("blocked")),
            },
            "markers_write_ok": _events(markers_write_ok),
            "markers_conflict": _events(markers_conflict),
            "markers_after": _events(markers_after),
        },
    )


def _scenario_05_rollback_after_provider_mismatch_or_invariant() -> DrillResult:
    """
    5) rollback after provider mismatch / invariant violation
    """
    failures: List[str] = []
    scope = _new_scope("s05")
    env_jazz = _base_env_jazz_ready(scope)

    markers_mismatch, on_mismatch = _capture_markers()
    mismatch = diagram_jazz_api_read_contract(
        session_id=scope["session_id"],
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        provider="camunda",  # active provider in env is zeebe
        env=env_jazz,
        request_trace=_trace_meta("drill-corr-s05-mismatch", "read_attempt"),
        on_marker=on_mismatch,
    )
    _assert(int(mismatch.get("status") or 0) == 409, "s05: provider mismatch should be 409", failures)
    _assert(_as_text(mismatch.get("blocked")) == "diagram_jazz_provider_mismatch", "s05: expected provider mismatch reason", failures)

    env_rollback = dict(env_jazz)
    env_rollback["DIAGRAM_OWNER_STATE"] = "rollback_to_legacy"
    env_rollback["DIAGRAM_JAZZ_ROLLBACK_TRIGGER"] = "1"
    env_rollback["DIAGRAM_JAZZ_ROLLBACK_READY"] = "1"

    markers_after, on_after = _capture_markers()
    after = diagram_jazz_api_write_contract(
        session_id=scope["session_id"],
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        payload=DiagramJazzWriteIn(xml="<bpmn:definitions id='s05_after' />"),
        provider_query="zeebe",
        env=env_rollback,
        request_trace=_trace_meta("drill-corr-s05-after", "write_attempt"),
        on_marker=on_after,
    )
    _assert(int(after.get("status") or 0) in {400, 409}, "s05: expected blocked write after rollback", failures)
    _assert(_as_text(after.get("blocked")) == "diagram_cutover_rollback_active", "s05: expected rollback_active block", failures)
    _assert("diagram_cutover_rollback" in _events(markers_after), "s05: missing rollback marker after mismatch", failures)

    return DrillResult(
        scenario="s05_rollback_after_provider_mismatch_or_invariant",
        passed=not failures,
        failures=failures,
        detail={
            "mismatch": {
                "status": int(mismatch.get("status") or 0),
                "blocked": _as_text(mismatch.get("blocked")),
            },
            "after_rollback_write": {
                "status": int(after.get("status") or 0),
                "blocked": _as_text(after.get("blocked")),
            },
            "markers_mismatch": _events(markers_mismatch),
            "markers_after": _events(markers_after),
        },
    )


def _scenario_06_rollback_missing_prerequisite_fail_closed() -> DrillResult:
    """
    6) rollback with missing prerequisite (must fail closed)
    """
    failures: List[str] = []
    scope = _new_scope("s06")
    env_rollback_missing = _base_env_jazz_ready(scope)
    env_rollback_missing["DIAGRAM_OWNER_STATE"] = "rollback_to_legacy"
    env_rollback_missing["DIAGRAM_JAZZ_ROLLBACK_READY"] = "1"
    env_rollback_missing["DIAGRAM_JAZZ_ROLLBACK_TRIGGER"] = "0"

    state = resolve_diagram_owner_cutover_state(
        env_rollback_missing,
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        session_id=scope["session_id"],
    )
    _assert(state.effective_state == "cutover_blocked", "s06: expected cutover_blocked when rollback trigger missing", failures)
    _assert(state.blocked_reason == "diagram_cutover_rollback_trigger_missing", "s06: expected rollback_trigger_missing reason", failures)
    _assert(state.diagram_owner == "legacy_owner", "s06: owner must remain legacy", failures)

    markers, on_marker = _capture_markers()
    out = diagram_jazz_api_read_contract(
        session_id=scope["session_id"],
        org_id=scope["org_id"],
        project_id=scope["project_id"],
        provider="zeebe",
        env=env_rollback_missing,
        request_trace=_trace_meta("drill-corr-s06", "read_attempt"),
        on_marker=on_marker,
    )
    _assert(int(out.get("status") or 0) >= 400, "s06: expected blocked status", failures)
    _assert(_as_text(out.get("blocked")) == "diagram_cutover_rollback_trigger_missing", "s06: expected fail-closed reason", failures)
    _assert("diagram_jazz_api_blocked" in _events(markers), "s06: missing api blocked marker", failures)

    return DrillResult(
        scenario="s06_rollback_missing_prerequisite_fail_closed",
        passed=not failures,
        failures=failures,
        detail={
            "state": {
                "effective_state": state.effective_state,
                "blocked_reason": state.blocked_reason,
                "diagram_owner": state.diagram_owner,
            },
            "read": {
                "status": int(out.get("status") or 0),
                "blocked": _as_text(out.get("blocked")),
            },
            "markers": _events(markers),
        },
    )


def run_all_drills() -> Dict[str, Any]:
    scenarios = [
        _scenario_01_requested_jazz_before_activation,
        _scenario_02_rollback_when_cutover_blocked,
        _scenario_03_explicit_rollback_trigger,
        _scenario_04_rollback_after_write_conflict,
        _scenario_05_rollback_after_provider_mismatch_or_invariant,
        _scenario_06_rollback_missing_prerequisite_fail_closed,
    ]
    results = [fn() for fn in scenarios]
    return {
        "ok": all(item.passed for item in results),
        "count": len(results),
        "passed": sum(1 for item in results if item.passed),
        "failed": sum(1 for item in results if not item.passed),
        "results": [
            {
                "scenario": item.scenario,
                "passed": item.passed,
                "failures": item.failures,
                "detail": item.detail,
            }
            for item in results
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Stage 7 rollback drills for Diagram->Jazz contract (default-off).")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output.")
    args = parser.parse_args()

    summary = run_all_drills()
    if args.pretty:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(summary, ensure_ascii=False))
    return 0 if summary.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
