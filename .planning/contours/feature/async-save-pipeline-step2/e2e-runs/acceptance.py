#!/usr/bin/env python3
"""Backend live-uvicorn acceptance — feature/async-save-pipeline-step2
(TESTS.md §4.4, урок #989): ключевые пути против живого uvicorn-стека
(TestClient маскирует org ContextVar в threadpool).

Проверки (все на org != default):
  A. POST /operations со stale baseVersion → 409, payload содержит
     server_current_xml (валидный XML, совпадает с хранимым).
  B. ops_committed приходит по SSE (GET /api/sessions/{id}/events?access_token=)
     когда второй клиент применяет ops.
  C. presence touch с editingElementId → active_users echo с editingElementId.
"""

import http.client
import json
import threading
import time
import urllib.error
import urllib.request
import uuid

API = "http://localhost:8011"
PASS = []
FAIL = []


def req(method, path, token=None, org=None, body=None, headers_extra=None, timeout=30):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if org:
        headers["X-Org-Id"] = org
    if headers_extra:
        headers.update(headers_extra)
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(f"[{'PASS' if ok else 'FAIL'}] {name} {detail}")


SEED_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_acc" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="Acceptance task"><bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1"><bpmn:incoming>Flow_2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
    <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="170" y="170" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="290" y="148" width="170" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="560" y="170" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="206" y="188" /><di:waypoint x="290" y="188" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="460" y="188" /><di:waypoint x="560" y="188" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>"""


def sse_listener(sid, token, events, stop):
    """Читает SSE-поток, собирает event/data пары до stop-события."""
    conn = http.client.HTTPConnection("localhost", 8011, timeout=20)
    try:
        conn.request("GET", f"/api/sessions/{sid}/events?access_token={token}",
                     headers={"Accept": "text/event-stream"})
        resp = conn.getresponse()
        events.append(("__status__", resp.status))
        buf_event = ""
        buf_data = ""
        while not stop.is_set():
            line = resp.fp.readline()
            if not line:
                break
            line = line.decode("utf-8", "replace").rstrip("\n").rstrip("\r")
            if line.startswith("event:"):
                buf_event = line[6:].strip()
            elif line.startswith("data:"):
                buf_data = line[5:].strip()
            elif line == "":
                if buf_event and buf_data:
                    events.append((buf_event, buf_data))
                buf_event = ""
                buf_data = ""
    except Exception as exc:  # noqa: BLE001
        events.append(("__error__", str(exc)))
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass


def main():
    tag = uuid.uuid4().hex[:8]

    st, body = req("POST", "/api/auth/login", body={"email": "admin@local", "password": "admin"})
    token = json.loads(body)["access_token"]
    check("login admin@local", st == 200)

    st, body = req("POST", "/api/orgs", token, body={"name": f"acc-{tag}"})
    org = json.loads(body)["id"]
    check("create non-default org", st in (200, 201), f"org={org}")

    st, body = req("POST", "/api/projects", token, org, {"title": f"acc proj {tag}", "passport": {}})
    proj = json.loads(body)
    pid = str(proj.get("id") or proj.get("project_id") or "")
    proj_org = str(proj.get("org_id") or "")
    check("create project in non-default org", st == 200 and pid and proj_org == org,
          f"project={pid} org={proj_org}")

    st, body = req("POST", f"/api/projects/{pid}/sessions?mode=quick_skeleton", token, org,
                   {"title": f"acc session {tag}", "roles": ["Оператор"], "start_role": "Оператор"})
    sess = json.loads(body)
    sid = str(sess.get("id") or sess.get("session_id") or "")
    check("create session in non-default org", st == 200 and sid, f"session={sid}")

    st, body = req("PUT", f"/api/sessions/{sid}/bpmn", token, org,
                   {"xml": SEED_XML, "base_diagram_state_version": 0, "base_bpmn_xml_version": 0})
    check("seed bpmn (version 0 → 1)", st == 200, body[:160])

    # --- A: 409 payload содержит server_current_xml в org != default ---------
    st, body = req("POST", f"/api/sessions/{sid}/operations", token, org,
                   {"baseVersion": 0,
                    "operations": [{"opId": f"acc-{tag}-x1", "type": "element.updateProperties",
                                    "elementId": "Task_1", "properties": {"name": "conflict probe"}}]})
    detail = {}
    try:
        detail = json.loads(body)
    except Exception:  # noqa: BLE001
        pass
    d = detail.get("detail") if isinstance(detail.get("detail"), dict) else detail
    xml_409 = str((d or {}).get("server_current_xml") or "")
    check("A1 stale baseVersion → 409", st == 409, f"status={st}")
    check("A2 409 payload has server_current_xml (non-default org)",
          bool(xml_409) and "<bpmn:definitions" in xml_409 and 'id="Task_1"' in xml_409,
          f"xml_len={len(xml_409)}")

    st, body = req("GET", f"/api/sessions/{sid}/bpmn?raw=1", token, org)
    stored = body
    check("A3 stored XML matches server_current_xml", stored.strip() == xml_409.strip(),
          f"stored_len={len(stored)} payload_len={len(xml_409)}")

    # --- B: ops_committed приходит по SSE ------------------------------------
    events = []
    stop = threading.Event()
    t = threading.Thread(target=sse_listener, args=(sid, token, events, stop), daemon=True)
    t.start()
    time.sleep(1.5)  # дать стриму подключиться

    st, body = req("POST", f"/api/sessions/{sid}/operations", token, org,
                   {"baseVersion": 1,
                    "operations": [{"opId": f"acc-{tag}-b1", "type": "element.updateProperties",
                                    "elementId": "Task_1", "properties": {"name": f"SSE marker {tag}"}}]},
                   headers_extra={"X-PM-Client-Id": f"acc-client-{tag}"})
    check("B0 second client ops commit → 200", st == 200, body[:160])

    deadline = time.time() + 15
    got = None
    while time.time() < deadline and got is None:
        for evt, data in events:
            if evt == "ops_committed":
                got = json.loads(data)
        if got is None:
            time.sleep(0.2)
    stop.set()
    t.join(timeout=5)
    check("B1 ops_committed received over SSE", got is not None,
          f"events={[(e, (len(d) if isinstance(d, str) else d)) for e, d in events][:6]}")
    if got:
        check("B2 payload contract (version/operations/actor_client_id/full)",
              got.get("version") == 2
              and isinstance(got.get("operations"), list) and len(got["operations"]) == 1
              and got.get("actor_client_id") == f"acc-client-{tag}"
              and got.get("full") is False,
              json.dumps(got)[:240])

    # --- C: presence touch с editingElementId --------------------------------
    st, body = req("POST", f"/api/sessions/{sid}/presence", token, org,
                   {"client_id": f"acc-presence-{tag}", "surface": "process_stage",
                    "editing_element_id": "Task_1"})
    pres = json.loads(body)
    users = pres.get("active_users") or []
    echo = [u for u in users if (u.get("editingElementId") or "") == "Task_1"]
    check("C1 presence touch 200 (non-default org)", st == 200, body[:160])
    check("C2 active_users echoes editingElementId", st == 200 and len(echo) == 1,
          json.dumps(users)[:240])

    # --- итог ----------------------------------------------------------------
    print("\n=== SUMMARY ===")
    print(f"PASS: {len(PASS)}  FAIL: {len(FAIL)}")
    if FAIL:
        print("failed:", FAIL)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
