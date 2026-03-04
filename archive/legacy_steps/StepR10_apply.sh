#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="feat/frontend-r10-graph-editor-overlay-v1"
TAG_START="cp/foodproc_frontend_r10_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r10_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r10_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R10 start (${TS})" >/dev/null 2>&1 || true
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
echo "== ensure dirs =="
mkdir -p frontend/src/components/process

echo
echo "== write GraphEditorOverlay.jsx =="
cat > frontend/src/components/process/GraphEditorOverlay.jsx <<'EOF'
import { useEffect, useMemo, useState } from "react";
import { uid } from "../../lib/ids";
import { ensureDraftShape, readDraft, writeDraft } from "../../lib/draft";
import { apiSaveSession } from "../../lib/api";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

function draftRoles(draft) {
  const roles = Array.isArray(draft?.roles) ? draft.roles : [];
  return roles.filter((r) => r && typeof r.role_id === "string");
}

function safeNodes(draft) {
  const arr = Array.isArray(draft?.nodes) ? draft.nodes : [];
  return arr.filter((n) => n && (typeof n.id === "string" || typeof n.node_id === "string"));
}

function safeEdges(draft) {
  const arr = Array.isArray(draft?.edges) ? draft.edges : [];
  return arr.filter((e) => e && (typeof e.id === "string" || typeof e.edge_id === "string"));
}

function nodeIdOf(n) {
  return (typeof n?.node_id === "string" && n.node_id) || (typeof n?.id === "string" && n.id) || "";
}

export default function GraphEditorOverlay({ sessionId }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => ensureDraftShape(readDraft()));
  const [status, setStatus] = useState("");

  const roles = useMemo(() => draftRoles(draft), [draft]);
  const nodes = useMemo(() => safeNodes(draft), [draft]);
  const edges = useMemo(() => safeEdges(draft), [draft]);

  const [nodeType, setNodeType] = useState("step");
  const [nodeLabel, setNodeLabel] = useState("");
  const [nodeActor, setNodeActor] = useState("");

  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");

  useEffect(() => {
    const onUpdate = () => setDraft(ensureDraftShape(readDraft()));
    window.addEventListener("fpc:draft-updated", onUpdate);
    return () => window.removeEventListener("fpc:draft-updated", onUpdate);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDraft(ensureDraftShape(readDraft()));
  }, [open]);

  useEffect(() => {
    if (nodeActor) return;
    const sr = typeof draft?.start_role === "string" ? draft.start_role : "";
    if (sr) setNodeActor(sr);
  }, [draft, nodeActor]);

  async function persist(next) {
    writeDraft(next);
    window.dispatchEvent(new Event("fpc:draft-updated"));

    if (!sessionId || isLocalSessionId(sessionId)) {
      setStatus("local: сохранено только в браузере");
      return;
    }

    setStatus("saving…");
    const r = await apiSaveSession(sessionId, next);
    if (r.ok) setStatus(`saved (${r.method || "api"})`);
    else setStatus("save failed (API)");
    window.dispatchEvent(new Event("fpc:graph-saved"));
  }

  async function addNode() {
    const label = nodeLabel.trim();
    if (!label) return;

    const id = uid("n");
    const role = nodeActor || "";

    const node = {
      id,
      node_id: id,
      type: nodeType,
      label,
      actor_role: role || undefined,
      recipient_role: undefined,
    };

    const next = {
      ...draft,
      session_id: draft?.session_id || sessionId || "",
      nodes: [...nodes, node],
      edges: edges,
    };

    setNodeLabel("");
    if (!edgeFrom) setEdgeFrom(id);
    await persist(next);
  }

  async function addEdge() {
    if (!edgeFrom || !edgeTo || edgeFrom === edgeTo) return;

    const id = uid("e");
    const edge = {
      id,
      edge_id: id,
      from: edgeFrom,
      to: edgeTo,
      source: edgeFrom,
      target: edgeTo,
      source_id: edgeFrom,
      target_id: edgeTo,
      type: "sequence",
    };

    const next = {
      ...draft,
      session_id: draft?.session_id || sessionId || "",
      nodes: nodes,
      edges: [...edges, edge],
    };

    await persist(next);
  }

  async function clearGraph() {
    const next = {
      ...draft,
      session_id: draft?.session_id || sessionId || "",
      nodes: [],
      edges: [],
    };
    setEdgeFrom("");
    setEdgeTo("");
    await persist(next);
  }

  if (!open) {
    return (
      <div style={{ position: "absolute", right: 12, top: 12, zIndex: 30 }}>
        <button className="primaryBtn" onClick={() => setOpen(true)} style={{ padding: "6px 10px" }}>
          Graph
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", right: 12, top: 12, zIndex: 30, width: 360 }}>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ fontWeight: 900 }}>Graph editor</div>
          <button className="ghostBtn" onClick={() => setOpen(false)} title="Close">
            ✕
          </button>
        </div>

        <div className="small muted" style={{ marginTop: 6 }}>
          nodes: <b>{nodes.length}</b> · edges: <b>{edges.length}</b>
        </div>

        <div className="hr" />

        <div style={{ fontWeight: 900, marginBottom: 6 }}>Add node</div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, alignItems: "center" }}>
            <div className="small muted">type</div>
            <select value={nodeType} onChange={(e) => setNodeType(e.target.value)} className="input">
              <option value="step">step</option>
              <option value="decision">decision</option>
              <option value="fork">fork</option>
              <option value="join">join</option>
              <option value="end">end</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, alignItems: "center" }}>
            <div className="small muted">actor_role</div>
            <select value={nodeActor} onChange={(e) => setNodeActor(e.target.value)} className="input">
              <option value="">—</option>
              {roles.map((r) => (
                <option key={r.role_id} value={r.role_id}>
                  {r.label || r.role_id}
                </option>
              ))}
            </select>
          </div>

          <input
            className="input"
            value={nodeLabel}
            onChange={(e) => setNodeLabel(e.target.value)}
            placeholder="label (например: Подготовка ингредиентов)"
          />

          <button className="primaryBtn" onClick={addNode} disabled={!nodeLabel.trim()}>
            + Add node
          </button>
        </div>

        <div className="hr" />

        <div style={{ fontWeight: 900, marginBottom: 6 }}>Add edge</div>
        <div style={{ display: "grid", gap: 8 }}>
          <select value={edgeFrom} onChange={(e) => setEdgeFrom(e.target.value)} className="input">
            <option value="">from…</option>
            {nodes.map((n) => (
              <option key={nodeIdOf(n)} value={nodeIdOf(n)}>
                {n.label || nodeIdOf(n)}
              </option>
            ))}
          </select>

          <select value={edgeTo} onChange={(e) => setEdgeTo(e.target.value)} className="input">
            <option value="">to…</option>
            {nodes.map((n) => (
              <option key={nodeIdOf(n)} value={nodeIdOf(n)}>
                {n.label || nodeIdOf(n)}
              </option>
            ))}
          </select>

          <button className="primaryBtn" onClick={addEdge} disabled={!edgeFrom || !edgeTo || edgeFrom === edgeTo}>
            + Add edge
          </button>
        </div>

        <div className="hr" />

        <div style={{ display: "flex", gap: 10 }}>
          <button className="dangerBtn" onClick={clearGraph}>
            Clear graph
          </button>
          <button className="ghostBtn" onClick={() => window.dispatchEvent(new Event("fpc:graph-saved"))}>
            Reload BPMN
          </button>
        </div>

        <div className="small muted" style={{ marginTop: 10 }}>
          status: <b>{status || "—"}</b>
        </div>

        {sessionId && isLocalSessionId(sessionId) ? (
          <div className="small muted" style={{ marginTop: 8 }}>
            Сейчас <b>local_*</b> — BPMN берётся из mock. Для реального workflow создай сессию через <b>+ New (API)</b>.
          </div>
        ) : null}
      </div>
    </div>
  );
}
EOF

echo
echo "== update BpmnStage.jsx (overlay + reload on graph-saved) =="
cat > frontend/src/components/process/BpmnStage.jsx <<'EOF'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

import GraphEditorOverlay from "./GraphEditorOverlay";

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
</bpmn:definitions>
`;

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

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

  const importXml = useMemo(() => {
    return async (fit = true) => {
      const v = viewerRef.current;
      if (!v) return;
      const xml = await fetchBpmnXml(sessionId);
      await v.importXML(xml);
      if (fit) v.get("canvas").zoom("fit-viewport");
    };
  }, [sessionId]);

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
      async reload() {
        try {
          setError("");
          await importXml(true);
          setReady(true);
        } catch (e) {
          setError(String(e?.message || e));
        }
      },
    }),
    [importXml]
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
        await importXml(true);
        if (!alive) return;

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
  }, [sessionId, enabled, onElementClick, onViewportChange, onBackgroundClick, importXml]);

  useEffect(() => {
    const onSaved = () => {
      api.reload().catch(() => {});
    };
    window.addEventListener("fpc:graph-saved", onSaved);
    return () => window.removeEventListener("fpc:graph-saved", onSaved);
  }, [api]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <GraphEditorOverlay sessionId={sessionId} />
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
echo "== styles: ensure .input and .dangerBtn exist =="
APP_CSS="frontend/src/styles/app.css"
if [ -f "$APP_CSS" ]; then
  if ! grep -q "graph_editor_inputs_v1" "$APP_CSS"; then
    cat >> "$APP_CSS" <<'EOF'

/* graph_editor_inputs_v1 */
.input {
  width: 100%;
  background: #fff;
  border: 1px solid rgba(16,24,40,0.12);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
}

.dangerBtn {
  background: rgba(220,38,38,0.10);
  border: 1px solid rgba(220,38,38,0.25);
  color: rgba(153,27,27,0.95);
  border-radius: 10px;
  padding: 8px 10px;
  font-weight: 800;
  cursor: pointer;
}

.dangerBtn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
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
git commit -m "feat(frontend): graph editor overlay (nodes/edges) + reload BPMN on save (R10)" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R10 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend -x "frontend/node_modules/*" -x "frontend/dist/*" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG_START\""
