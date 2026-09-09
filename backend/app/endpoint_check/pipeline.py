from __future__ import annotations

import json
import concurrent.futures
import time
from typing import Any, Callable, Dict, List, Tuple

PROFILE_READ_ONLY = "read_only"
PROFILE_SAVE_PIPELINE = "save_pipeline"
PROFILE_FULL = "full"
PROFILES = {PROFILE_READ_ONLY, PROFILE_SAVE_PIPELINE, PROFILE_FULL}

STEP_XML = "xml"
STEP_XML_META = "xml_meta"
STEP_PARALLEL = "parallel_xml_raw_xml"
STEP_TIMEOUT = "timeout_lock_conflict"
STEP_FINAL_SAVE = "final_save"
SAVE_STEPS = {STEP_XML, STEP_XML_META, STEP_PARALLEL, STEP_TIMEOUT, STEP_FINAL_SAVE}
DEFAULT_SAVE_CHAIN = [STEP_XML, STEP_XML_META, STEP_PARALLEL, STEP_TIMEOUT, STEP_FINAL_SAVE]


class PipelineConfigError(ValueError):
    pass


def normalize_profile(value: Any) -> str:
    profile = str(value or PROFILE_READ_ONLY).strip().lower()
    if profile not in PROFILES:
        raise PipelineConfigError(f"unsupported endpoint-check profile: {profile}")
    return profile


def normalize_save_chain(value: Any, *, required: bool) -> List[str]:
    if not required:
        return []
    raw = value if isinstance(value, list) and value else DEFAULT_SAVE_CHAIN
    chain = [str(step or "").strip().lower() for step in raw]
    unknown = [step for step in chain if step not in SAVE_STEPS]
    if unknown:
        raise PipelineConfigError(f"unsupported save pipeline step: {unknown[0]}")
    if chain[-1] != STEP_FINAL_SAVE:
        raise PipelineConfigError("save pipeline must end with final_save")
    return chain


def build_run_config(profile: Any, chain: Any = None) -> Dict[str, Any]:
    normalized_profile = normalize_profile(profile)
    needs_save = normalized_profile in {PROFILE_SAVE_PIPELINE, PROFILE_FULL}
    return {
        "profile": normalized_profile,
        "save_chain": normalize_save_chain(chain, required=needs_save),
    }


def estimate_result_count(chain: List[str]) -> int:
    # Fixture create + cleanup, one row per simple step, two for the parallel
    # probe, and at least one resync plus one terminal save.
    weights = {STEP_PARALLEL: 2, STEP_FINAL_SAVE: 2}
    return 2 + sum(weights.get(step, 1) for step in chain)


def parse_json_body(body: bytes) -> Dict[str, Any]:
    try:
        value = json.loads(body.decode("utf-8", "replace"))
    except Exception:
        return {}
    return value if isinstance(value, dict) else {}


MutationExecutor = Callable[[str, str, Dict[str, Any], str, float], Tuple[int, float, bytes, str]]

_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_endpoint_check" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_endpoint_check" isExecutable="false">
    <bpmn:startEvent id="Start"/><bpmn:task id="Task" name="Endpoint check"/><bpmn:endEvent id="End"/>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start" targetRef="Task"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task" targetRef="End"/>
  </bpmn:process>
</bpmn:definitions>"""


def default_mutation_executor(method: str, path: str, body: Dict[str, Any], token: str, timeout_s: float):
    import requests
    from .service import base_url

    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    started = time.monotonic()
    try:
        response = requests.request(method, f"{base_url()}{path}", json=body or None, headers=headers, timeout=timeout_s)
        return response.status_code, (time.monotonic() - started) * 1000, response.content[:8000], ""
    except requests.Timeout:
        return 0, (time.monotonic() - started) * 1000, b"", "timeout"
    except requests.RequestException as exc:
        return 0, (time.monotonic() - started) * 1000, str(exc)[:500].encode(), "conn_error"


def execute_save_pipeline(
    *, run_id: str, token: str, chain: List[str], executor: MutationExecutor | None = None
) -> List[Dict[str, Any]]:
    call = executor or default_mutation_executor
    results: List[Dict[str, Any]] = []
    session_id = ""
    version = 0

    def invoke(operation_id: str, method: str, path: str, body: Dict[str, Any], timeout: float, expected: set[int]):
        status, latency, raw, err = call(method, path, body, token, timeout)
        category = "ok" if status in expected else (err or "http_error")
        row = {
            "run_id": run_id,
            "operation_id": operation_id,
            "method": method,
            "path": path,
            "url_path": path,
            "http_status": status,
            "category": category,
            "latency_ms": round(latency, 1),
            "fingerprint": "",
            "note": "expected save-pipeline observation" if status in {0, 409, 423} else "",
            "body_excerpt": raw.decode("utf-8", "replace")[:2000] if category != "ok" else "",
            "error_events_json": [],
        }
        results.append(row)
        return status, parse_json_body(raw), err

    def save(step: str, *, meta: bool = False, timeout: float = 20.0, expected: set[int] | None = None, operation_id: str = ""):
        nonlocal version
        payload: Dict[str, Any] = {
            "xml": _XML.replace("Endpoint check", f"Endpoint check {step}"),
            "base_diagram_state_version": version,
            "source_action": "endpoint_check",
        }
        if meta:
            payload["bpmn_meta"] = {"endpoint_check": {"step": step}}
        status, data, err = invoke(
            operation_id or f"save_pipeline_{step}", "PUT", f"/api/sessions/{session_id}/bpmn", payload, timeout, expected or {200}
        )
        if not err and status == 200:
            version = int(data.get("diagram_state_version", version) or version)
        return status

    try:
        status, created, err = invoke(
            "save_pipeline_create_fixture", "POST", "/api/sessions", {"title": "Endpoint Check Temporary"}, 20.0, {200, 201}
        )
        session_id = str(created.get("id") or created.get("session", {}).get("id") or "").strip()
        version = int(created.get("diagram_state_version", created.get("session", {}).get("diagram_state_version", 0)) or 0)
        if err or status not in {200, 201} or not session_id:
            raise RuntimeError("endpoint-check could not create temporary session")

        for step in chain:
            if step == STEP_XML:
                save(step)
            elif step == STEP_XML_META:
                save(step, meta=True)
            elif step == STEP_PARALLEL:
                base = version
                payloads = [
                    {"xml": _XML.replace("Endpoint check", "Endpoint check xml"), "base_diagram_state_version": base, "source_action": "endpoint_check"},
                    {"xml": _XML.replace("Endpoint check", "Endpoint check rawXml"), "base_diagram_state_version": base, "source_action": "endpoint_check"},
                ]
                with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                    futures = [
                        pool.submit(call, "PUT", f"/api/sessions/{session_id}/bpmn", payload, token, 20.0)
                        for payload in payloads
                    ]
                    for index, future in enumerate(futures):
                        s, latency, raw, e = future.result()
                        category = e or ("ok" if s in {200, 409, 423} else "http_error")
                        results.append({
                            "run_id": run_id, "operation_id": f"save_pipeline_parallel_{index + 1}", "method": "PUT",
                            "path": "/api/sessions/{session_id}/bpmn", "url_path": f"/api/sessions/{session_id}/bpmn",
                            "http_status": s, "category": category, "latency_ms": round(latency, 1), "fingerprint": "",
                            "note": "parallel xml/rawXml probe", "body_excerpt": raw.decode("utf-8", "replace")[:2000] if category != "ok" else "",
                            "error_events_json": [],
                        })
                        data = parse_json_body(raw)
                        if s == 200:
                            version = max(version, int(data.get("diagram_state_version", version) or version))
            elif step == STEP_TIMEOUT:
                save(step, timeout=0.05, expected={0, 200, 409, 423})
            elif step == STEP_FINAL_SAVE:
                terminal_deadline = time.monotonic() + 20.0
                attempt = 0
                while True:
                    attempt += 1
                    s, data, _ = invoke(
                        f"save_pipeline_resync_{attempt}", "GET", f"/api/sessions/{session_id}", {}, 20.0, {200}
                    )
                    if s == 200:
                        session = data.get("session") if isinstance(data.get("session"), dict) else data
                        version = int(session.get("diagram_state_version", version) or version)
                    final_status = save(
                        step,
                        expected={200},
                        operation_id=f"save_pipeline_final_save_attempt_{attempt}",
                    )
                    if final_status == 200:
                        results[-1]["operation_id"] = "save_pipeline_final_save"
                        break
                    if time.monotonic() >= terminal_deadline:
                        raise RuntimeError("endpoint-check terminal save did not succeed before deadline")
                    time.sleep(0.5)
        return results
    finally:
        if session_id:
            invoke("save_pipeline_cleanup", "DELETE", f"/api/sessions/{session_id}", {}, 20.0, {200, 204, 404})
