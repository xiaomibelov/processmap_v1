#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
TAG="cp/foodproc_frontend_r20_start_${TS}"
git tag -a "$TAG" -m "checkpoint: foodproc frontend r20 start (${TS})" >/dev/null 2>&1 || true
echo
echo "== checkpoint tag (start) =="
echo "$TAG"

echo
echo "== write: frontend/src/components/process/BpmnStage.jsx (contrast + AI badges sync + element->node mapping) =="
cat > frontend/src/components/process/BpmnStage.jsx <<'EOF'
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import BpmnJS from "bpmn-js/lib/NavigatedViewer";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

function buildFallbackBpmn() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт" />
    <bpmn:endEvent id="EndEvent_1" name="Финиш" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="240" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="420" y="240" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="258"/>
        <di:waypoint x="420" y="258"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function resolveNodeIdForElement(el, session) {
  const nodes = Array.isArray(session?.nodes) ? session.nodes : [];
  if (!el) return null;

  const eid = String(el.id || "");
  if (eid && nodes.some((n) => n && n.id === eid)) return eid;

  const name = norm(el?.businessObject?.name);
  if (!name) return null;

  const hits = nodes.filter((n) => norm(n?.title) === name);
  if (hits.length === 1) return hits[0].id;

  return null;
}

const BpmnStage = forwardRef(function BpmnStage(
  { sessionId, reloadKey = 0, session = null, onElementClick = null },
  ref
) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);
  const [status, setStatus] = useState("");

  const fallbackXml = useMemo(() => buildFallbackBpmn(), []);

  useImperativeHandle(ref, () => ({
    zoomIn() {
      const v = viewerRef.current;
      if (!v) return;
      const canvas = v.get("canvas");
      const z = canvas.zoom();
      canvas.zoom(z + 0.2);
    },
    zoomOut() {
      const v = viewerRef.current;
      if (!v) return;
      const canvas = v.get("canvas");
      const z = canvas.zoom();
      canvas.zoom(Math.max(0.2, z - 0.2));
    },
    fit() {
      const v = viewerRef.current;
      if (!v) return;
      const canvas = v.get("canvas");
      canvas.zoom("fit-viewport");
    },
  }));

  const syncBadges = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    let overlays = null;
    let registry = null;
    try {
      overlays = viewer.get("overlays");
      registry = viewer.get("elementRegistry");
    } catch (_) {
      return;
    }
    if (!overlays || !registry) return;

    try { overlays.clear(); } catch (_) {}

    const questions = Array.isArray(session?.questions) ? session.questions : [];
    if (!questions.length) return;

    const els = registry.filter((el) => {
      const t = el?.type || "";
      return t === "bpmn:Task" || t === "bpmn:UserTask" || t === "bpmn:ServiceTask";
    });

    for (const el of els) {
      const nodeId = resolveNodeIdForElement(el, session) || el.id;
      const open = questions.filter((q) => q && q.node_id === nodeId && q.state !== "done");
      if (!open.length) continue;

      const root = document.createElement("div");
      root.className = "bpmnBadge";
      root.textContent = `AI ${open.length}`;

      overlays.add(el, "note", {
        position: { top: 6, right: 6 },
        html: root,
      });
    }
  }, [session]);

  useEffect(() => {
    if (!hostRef.current) return;

    const v = new BpmnJS({ container: hostRef.current });
    viewerRef.current = v;

    return () => {
      try { v.destroy(); } catch (_) {}
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    let offClick = null;
    let offViewbox = null;

    try {
      const eventBus = viewer.get("eventBus");

      const onClick = (event) => {
        const el = event?.element;
        if (!el?.id) return;

        const mapped = resolveNodeIdForElement(el, session);
        if (typeof onElementClick === "function") onElementClick(mapped || el.id);
      };

      const onViewboxChanged = () => syncBadges();

      eventBus.on("element.click", onClick);
      eventBus.on("canvas.viewbox.changed", onViewboxChanged);

      offClick = () => eventBus.off("element.click", onClick);
      offViewbox = () => eventBus.off("canvas.viewbox.changed", onViewboxChanged);
    } catch (_) {}

    return () => {
      try { offClick && offClick(); } catch (_) {}
      try { offViewbox && offViewbox(); } catch (_) {}
    };
  }, [onElementClick, session, syncBadges]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const v = viewerRef.current;
      if (!v) return;

      setStatus("");

      try {
        let xml = fallbackXml;

        if (sessionId && !isLocalSessionId(sessionId)) {
          const id = encodeURIComponent(sessionId);
          const res = await fetch(`/api/sessions/${id}/bpmn`, { credentials: "include" });
          if (!res.ok) {
            const t = await res.text().catch(() => "");
            throw new Error(`BPMN: ${res.status} ${t}`);
          }
          xml = await res.text();
        }

        await v.importXML(xml);
        v.get("canvas").zoom("fit-viewport");

        if (!cancelled) syncBadges();
      } catch (e) {
        if (cancelled) return;
        setStatus(String(e?.message || e));
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionId, reloadKey, fallbackXml, syncBadges]);

  useEffect(() => {
    syncBadges();
  }, [syncBadges]);

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div className="bpmnStage" ref={hostRef} />
      {status ? (
        <div className="panel" style={{ position: "absolute", left: 14, bottom: 14, width: 460, padding: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Ошибка BPMN</div>
          <div className="small muted">Импорт BPMN не удался. Проверь /api/sessions/&lt;id&gt;/bpmn.</div>
          <div className="small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{status}</div>
        </div>
      ) : null}
    </div>
  );
});

export default BpmnStage;
EOF

echo
echo "== patch: frontend/src/styles/theme_graphite.css (Process title color + BPMN contrast) =="
CSS="frontend/src/styles/theme_graphite.css"
if [ ! -f "$CSS" ]; then
  echo "ERROR: missing $CSS"
  false
fi

if ! grep -q "process head overrides (r20)" "$CSS" >/dev/null 2>&1; then
  perl -0777 -i -pe 's/(\n\/\* -------- BPMN\.js viewer styles ---- \*\/\n)/\n\/\* process head overrides (r20) *\/\n.processHead{color:var(--text);}\n.processHead .title{color:var(--text) !important;font-weight:800;letter-spacing:.2px;}\n.processHead .tag{color:var(--muted) !important;}\n\n$1/s' "$CSS"
fi

perl -i -pe '
  s/stroke: rgba\(255,255,255,0\.22\)/stroke: rgba(255,255,255,0.58)/g;
  s/stroke: rgba\(255,255,255,0\.18\)/stroke: rgba(255,255,255,0.52)/g;
  s/stroke: rgba\(255,255,255,0\.16\)/stroke: rgba(255,255,255,0.50)/g;
  s/fill: rgba\(255,255,255,0\.06\)/fill: rgba(255,255,255,0.10)/g;
  s/fill: rgba\(255,255,255,0\.74\)/fill: rgba(255,255,255,0.88)/g;
' "$CSS"

echo
echo "== build smoke =="
if [ -d frontend/node_modules ]; then
  ( cd frontend && npm -s run build )
else
  echo "skip: frontend/node_modules not found"
fi

echo
echo "== diff stat =="
git diff --stat || true

echo
echo "== commit (frontend only) =="
git add frontend/src/components/process/BpmnStage.jsx frontend/src/styles/theme_graphite.css
git status -sb || true
git commit -m "fix(frontend): Process title color + BPMN contrast + AI badge sync" || true

TAG_DONE="cp/foodproc_frontend_r20_done_${TS}"
git tag -a "$TAG_DONE" -m "checkpoint: foodproc frontend r20 done (${TS})" >/dev/null 2>&1 || true
echo
echo "== checkpoint tag (done) =="
echo "$TAG_DONE"

echo
echo "== zip artifact (exclude node_modules/dist) =="
mkdir -p artifacts
ZIP="artifacts/foodproc_frontend_r20_${TS}.zip"
zip -r "$ZIP" frontend -x "frontend/node_modules/*" "frontend/dist/*" >/dev/null
ls -la "$ZIP" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG\""
