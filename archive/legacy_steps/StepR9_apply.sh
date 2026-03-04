#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="fix/frontend-r9-topbar-size-and-copilot-click-v1"
TAG_START="cp/foodproc_frontend_r9_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r9_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r9_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R9 start (${TS})" >/dev/null 2>&1 || true
echo "$TAG_START"

echo
echo "== git (before) =="
git status -sb || true
git show -s --format='%ci %h %d %s' || true

echo
echo "== branch =="
git switch -c "$BR" >/dev/null 2>&1 || git switch "$BR" >/dev/null
git status -sb || true

echo
echo "== cleanup: restore accidental edits in helper step scripts (keep repo clean) =="
git restore Run_StepR6.sh Run_StepR7.sh StepR6_apply.sh StepR7_apply.sh 2>/dev/null || true

echo
echo "== write: BpmnStage (local_* uses mock, copilot fires only on real nodes) =="
mkdir -p frontend/src/components/process

cat > frontend/src/components/process/BpmnStage.jsx <<'EOF'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

const MOCK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://example.com/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_hot" name="Горячий цех">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_pack" name="Упаковка">
        <bpmn:flowNodeRef>Task_2</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>

    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>

    <bpmn:task id="Task_1" name="Обжарка">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>

    <bpmn:task id="Task_2" name="Упаковка">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:task>

    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>

    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="EndEvent_1" />
  </bpmn:process>

  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">

      <bpmndi:BPMNShape id="Lane_hot_di" bpmnElement="Lane_hot" isHorizontal="true">
        <dc:Bounds x="80" y="80" width="980" height="170" />
      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape id="Lane_pack_di" bpmnElement="Lane_pack" isHorizontal="true">
        <dc:Bounds x="80" y="250" width="980" height="170" />
      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="140" y="146" width="36" height="36" />
      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="240" y="124" width="150" height="80" />
      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape id="Task_2_di" bpmnElement="Task_2">
        <dc:Bounds x="460" y="294" width="150" height="80" />
      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="680" y="316" width="36" height="36" />
      </bpmndi:BPMNShape>

      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="176" y="164" />
        <di:waypoint x="240" y="164" />
      </bpmndi:BPMNEdge>

      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="390" y="164" />
        <di:waypoint x="460" y="334" />
      </bpmndi:BPMNEdge>

      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="610" y="334" />
        <di:waypoint x="680" y="334" />
      </bpmndi:BPMNEdge>

    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

// Only for nodes that make sense for "copilot questions".
// Avoid opening copilot on whitespace/process/lane/flow/labels.
function isCopilotTarget(el) {
  if (!el || !el.type) return false;
  if (el.labelTarget) return false;

  const t = el.type;

  if (
    t === "bpmn:Process" ||
    t === "bpmn:Lane" ||
    t === "bpmn:Participant" ||
    t === "bpmn:SequenceFlow" ||
    t === "bpmn:MessageFlow" ||
    t === "bpmn:Association"
  ) {
    return false;
  }

  return Boolean(
    t.endsWith("Task") ||
      t.endsWith("Event") ||
      t.endsWith("Gateway") ||
      t === "bpmn:SubProcess" ||
      t === "bpmn:CallActivity"
  );
}

async function fetchBpmnXml(sessionId) {
  if (!sessionId) return MOCK_XML;
  if (isLocalSessionId(sessionId)) return MOCK_XML;

  const url = `/api/sessions/${encodeURIComponent(sessionId)}/bpmn`;
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return MOCK_XML;
    const xml = await res.text();
    if (!xml || !xml.includes("<bpmn:definitions")) return MOCK_XML;
    return xml;
  } catch {
    return MOCK_XML;
  }
}

export default forwardRef(function BpmnStage(
  { sessionId, enabled = true, onElementClick, onViewportChange, onBackgroundClick },
  ref
) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const api = useMemo(
    () => ({
      zoomIn() {
        const v = viewerRef.current;
        if (!v) return;
        const canvas = v.get("canvas");
        canvas.zoom(canvas.zoom() + 0.2);
      },
      zoomOut() {
        const v = viewerRef.current;
        if (!v) return;
        const canvas = v.get("canvas");
        canvas.zoom(Math.max(0.2, canvas.zoom() - 0.2));
      },
      fit() {
        const v = viewerRef.current;
        if (!v) return;
        v.get("canvas").zoom("fit-viewport");
      },
    }),
    []
  );

  useImperativeHandle(ref, () => api, [api]);

  useEffect(() => {
    let alive = true;

    async function boot() {
      setReady(false);
      setError("");

      if (!enabled || !containerRef.current) return;

      const viewer = new NavigatedViewer({ container: containerRef.current });
      viewerRef.current = viewer;

      try {
        const xml = await fetchBpmnXml(sessionId);
        await viewer.importXML(xml);
        if (!alive) return;

        viewer.get("canvas").zoom("fit-viewport");
        setReady(true);

        const eventBus = viewer.get("eventBus");

        const onClick = (e) => {
          if (!alive) return;
          const el = e?.element || null;
          if (!el) return;

          if (typeof onElementClick === "function") {
            if (!isCopilotTarget(el)) return;
            onElementClick(el);
          }
        };

        const onVB = () => {
          if (!alive) return;
          if (typeof onViewportChange === "function") onViewportChange();
        };

        const onCanvas = () => {
          if (!alive) return;
          if (typeof onBackgroundClick === "function") onBackgroundClick();
        };

        eventBus.on("element.click", onClick);
        eventBus.on("canvas.viewbox.changed", onVB);

        // bpmn-js emits canvas.* events; this is a safe no-op if not.
        try {
          eventBus.on("canvas.click", onCanvas);
        } catch {}
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e));
      }
    }

    boot();

    return () => {
      alive = false;
      try {
        viewerRef.current?.destroy();
      } catch {}
      viewerRef.current = null;
    };
  }, [sessionId, enabled, onElementClick, onViewportChange, onBackgroundClick]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {enabled && !ready && !error ? (
        <div style={{ position: "absolute", left: 12, bottom: 12 }} className="card">
          <div className="small muted">Loading BPMN…</div>
        </div>
      ) : null}

      {enabled && error ? (
        <div style={{ position: "absolute", left: 12, bottom: 12 }} className="card">
          <div style={{ fontWeight: 900, marginBottom: 6 }}>BPMN import error</div>
          <div className="small muted">{error}</div>
        </div>
      ) : null}
    </div>
  );
});
EOF

echo
echo "== styles: shrink primaryBtn in topbar (prevents giant + New (API)) =="
APP_CSS="frontend/src/styles/app.css"
if [ -f "$APP_CSS" ]; then
  if ! grep -q "topbar_primary_compact_v1" "$APP_CSS"; then
    cat >> "$APP_CSS" <<'EOF'

/* topbar_primary_compact_v1 */
.topbar .primaryBtn {
  width: auto;
  flex: 0 0 auto;
  padding: 8px 12px;
}
EOF
  fi
fi

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== diff stat =="
git diff --stat || true

echo
echo "== commit (frontend only) =="
git add -A frontend
git status -sb || true
git commit -m "fix(frontend): prevent copilot on whitespace + use mock BPMN for local_*; shrink topbar primary button (R9)" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R9 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact (exclude node_modules/dist) =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend   -x "frontend/node_modules/*"   -x "frontend/dist/*" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout "$TAG_START""
