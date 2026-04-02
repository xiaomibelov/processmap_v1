#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="feat/frontend-r12-graphite-glass-ui-v1"
TAG_START="cp/foodproc_frontend_r12_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r12_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r12_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R12 start (${TS})" >/dev/null 2>&1 || true
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
echo "== unstage helper scripts/artifacts if any =="
git restore --staged StepR*.sh 2>/dev/null || true
git restore --staged Run_StepR*.sh 2>/dev/null || true
git restore --staged artifacts 2>/dev/null || true
git restore --staged artifacts/* 2>/dev/null || true

echo
echo "== styles: graphite glass theme =="
mkdir -p frontend/src/styles

cat > frontend/src/styles/theme_graphite.css <<'EOF'
:root{
  --bg0:#070A14;
  --bg1:#0B1020;

  --panel:rgba(255,255,255,.06);
  --panel2:rgba(255,255,255,.04);
  --border:rgba(255,255,255,.12);

  --text:rgba(255,255,255,.92);
  --muted:rgba(255,255,255,.62);

  --ok:#2FE58C;
  --warn:#FFBF3F;
  --err:#FF4D4D;
  --info:#7C5CFF;

  --ring:rgba(124,92,255,.55);
  --shadow:0 18px 55px rgba(0,0,0,.55);

  --r-lg:18px;
  --r-md:14px;
}

html, body { height: 100%; }

body{
  color:var(--text);
  background:
    radial-gradient(1100px 650px at 18% 12%, rgba(124,92,255,.18), transparent 60%),
    radial-gradient(900px 500px  at 80% 18%, rgba(47,229,140,.10), transparent 55%),
    linear-gradient(180deg,var(--bg0),var(--bg1));
}

/* Base */
a { color: inherit; }
.small { font-size: 12px; }
.muted { color: var(--muted); }
.hr { height:1px; background: rgba(255,255,255,.10); margin: 12px 0; }

/* Panel */
.panel{
  background:var(--panel);
  border:1px solid var(--border);
  border-radius:var(--r-lg);
  box-shadow:var(--shadow);
  backdrop-filter: blur(14px);
}
.panelHead{
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,.10);
  font-weight: 900;
}
.panelBody{ padding: 12px 14px; }

/* Top bar (works even if component uses these classNames) */
.topBar{
  background: rgba(10,18,36,.72);
  border-bottom: 1px solid rgba(255,255,255,.10);
  backdrop-filter: blur(16px);
}
.statusPill{
  display:inline-flex; align-items:center; gap:8px;
  padding:6px 10px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.05);
  font-size: 12px;
}
.statusDot{ width:8px; height:8px; border-radius:999px; background: rgba(255,255,255,.22); }
.statusDot.ok{ background: var(--ok); }
.statusDot.err{ background: var(--err); }
.statusDot.warn{ background: var(--warn); }
.statusDot.info{ background: var(--info); }

/* Buttons */
.btn{
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  color: var(--text);
  cursor: pointer;
  user-select: none;
}
.btn:hover{ border-color: rgba(255,255,255,.18); background: rgba(255,255,255,.08); }
.btn:disabled{ opacity:.45; cursor:not-allowed; }
.btnPrimary{
  border-color: rgba(124,92,255,.28);
  background: rgba(124,92,255,.20);
}
.btnPrimary:hover{ background: rgba(124,92,255,.28); }
.btnDanger{
  border-color: rgba(255,77,77,.28);
  background: rgba(255,77,77,.14);
}
.btnIcon{
  width: 36px; height: 36px; padding:0; border-radius: 12px;
}
.attention{
  outline:2px solid var(--ring);
  outline-offset:2px;
}

/* Inputs */
.input{
  width:100%;
  padding:10px 12px;
  border-radius:12px;
  background: rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.12);
  color:var(--text);
}
.input:focus{
  outline:2px solid var(--ring);
  outline-offset:2px;
  border-color: rgba(255,255,255,.18);
}
.input-row{
  display:flex; gap:10px; align-items:center;
}
.unit{
  padding:9px 10px;
  border-radius:12px;
  background: rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.10);
  color:var(--muted);
  font-size:12px;
}

/* Node card (for AI Copilot) */
.node{
  position:relative;
  padding:12px 12px 10px;
  border-radius: var(--r-md);
  background: var(--panel2);
  border: 1px solid rgba(255,255,255,.12);
}
.node::before{
  content:"";
  position:absolute; left:0; top:10px; bottom:10px;
  width:4px; border-radius:6px;
  background: rgba(255,255,255,.12);
}
.node[data-status="ok"]::before{ background: var(--ok); }
.node[data-status="warn"]::before{ background: var(--warn); }
.node[data-status="err"]::before{ background: var(--err); }
.node[data-status="info"]::before{ background: var(--info); }
.node:hover{ border-color: rgba(255,255,255,.18); }
.node[data-selected="true"]{ outline:2px solid var(--ring); outline-offset:2px; }

/* Pill */
.pill{
  display:inline-flex; align-items:center; gap:8px;
  padding:6px 10px;
  border-radius:999px;
  background: rgba(124,92,255,.14);
  border:1px solid rgba(124,92,255,.22);
  color: var(--text);
  font-size:12px;
}
.pill[data-priority="high"]{
  background: rgba(255,77,77,.14);
  border-color: rgba(255,77,77,.24);
}

/* DoD "светофор" */
.dod{
  display:flex; gap:10px; align-items:center;
  padding:10px 12px;
  border-radius:var(--r-md);
  background:var(--panel2);
  border:1px solid var(--border);
}
.dod .kpi{ font-size:12px; color:var(--muted); }
.dot{ width:10px; height:10px; border-radius:999px; }
.dot.ok{ background:var(--ok); }
.dot.warn{ background:var(--warn); }
.dot.err{ background:var(--err); }

/* Floating Copilot button/panel */
.fab{
  position:absolute; right:14px; bottom:14px;
  z-index: 30;
}
.copilotPanel{
  position:absolute; right:14px; top:14px;
  width: 360px;
  z-index: 30;
}
.copilotPanel .panelHead{
  display:flex; align-items:center; justify-content:space-between;
}
EOF

echo
echo "== main.jsx: ensure theme import =="

cat > frontend/src/main.jsx <<'EOF'
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/app.css";
import "./styles/theme_graphite.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
EOF

echo
echo "== lib/api.js: ensure apiSaveSession export (PATCH /api/sessions/{id}) =="

mkdir -p frontend/src/lib
cat > frontend/src/lib/api.js <<'EOF'
async function parseResponse(res, path, method) {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

export async function apiGet(path) {
  const res = await fetch(path, { credentials: "include" });
  return parseResponse(res, path, "GET");
}

export async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return parseResponse(res, path, "POST");
}

export async function apiPatch(path, body) {
  const res = await fetch(path, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return parseResponse(res, path, "PATCH");
}

export async function apiPut(path, body) {
  const res = await fetch(path, {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return parseResponse(res, path, "PUT");
}

/**
 * Frontend write-path used by GraphEditorOverlay (and later Copilot).
 * Backend currently supports PATCH at least for roles/start_role/title;
 * for full-session save we will converge on PUT or extended PATCH.
 */
export async function apiSaveSession(sessionId, partial) {
  const id = encodeURIComponent(sessionId);
  return apiPatch(`/api/sessions/${id}`, partial ?? {});
}
EOF

echo
echo "== process/BpmnStage.jsx: forwardRef + local fallback (no /bpmn fetch for local_*) =="
mkdir -p frontend/src/components/process

cat > frontend/src/components/process/BpmnStage.jsx <<'EOF'
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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

const BpmnStage = forwardRef(function BpmnStage({ sessionId, reloadKey = 0 }, ref) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);
  const [err, setErr] = useState("");

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

  useEffect(() => {
    if (!hostRef.current) return;

    const v = new BpmnJS({
      container: hostRef.current,
    });
    viewerRef.current = v;

    return () => {
      try { v.destroy(); } catch (_) {}
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const v = viewerRef.current;
      if (!v) return;

      setErr("");

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
      } catch (e) {
        if (cancelled) return;
        setErr(String(e?.message || e));
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionId, reloadKey, fallbackXml]);

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div ref={hostRef} style={{ height: "100%", background: "transparent" }} />
      {err ? (
        <div className="panel" style={{ position: "absolute", left: 14, bottom: 14, width: 420, padding: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Ошибка</div>
          <div className="small muted">Ошибка импорта BPMN. Проверь данные сессии и экспорт.</div>
          <div className="small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{err}</div>
        </div>
      ) : null}
    </div>
  );
});

export default BpmnStage;
EOF

echo
echo "== process/CopilotOverlay.jsx: bring back AI Copilot as toggle panel (no auto-open on canvas click) =="

cat > frontend/src/components/process/CopilotOverlay.jsx <<'EOF'
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../lib/api";

function keyFor(sessionId) {
  return `fpc_copilot_v1:${sessionId || "none"}`;
}

function readLocal(sessionId) {
  try {
    const raw = localStorage.getItem(keyFor(sessionId));
    if (!raw) return { selectedNodeId: "", questionsByNode: {} };
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : { selectedNodeId: "", questionsByNode: {} };
  } catch (_) {
    return { selectedNodeId: "", questionsByNode: {} };
  }
}

function writeLocal(sessionId, v) {
  try {
    localStorage.setItem(keyFor(sessionId), JSON.stringify(v));
  } catch (_) {}
}

export default function CopilotOverlay({ sessionId }) {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [apiErr, setApiErr] = useState("");
  const [draft, setDraft] = useState(() => readLocal(sessionId));

  useEffect(() => {
    setDraft(readLocal(sessionId));
  }, [sessionId]);

  useEffect(() => {
    writeLocal(sessionId, draft);
  }, [sessionId, draft]);

  const selectedNodeId = draft.selectedNodeId || "";
  const questions = useMemo(() => {
    const by = draft.questionsByNode || {};
    const arr = by[selectedNodeId] || [];
    return Array.isArray(arr) ? arr : [];
  }, [draft, selectedNodeId]);

  useEffect(() => {
    let cancelled = false;

    async function loadNodes() {
      setApiErr("");
      setNodes([]);

      if (!sessionId) return;
      if (String(sessionId).startsWith("local_")) return;

      try {
        const s = await apiGet(`/api/sessions/${encodeURIComponent(sessionId)}`);
        const arr = Array.isArray(s?.nodes) ? s.nodes : [];
        if (!cancelled) setNodes(arr);
      } catch (e) {
        if (!cancelled) setApiErr(String(e?.message || e));
      }
    }

    loadNodes();
    return () => { cancelled = true; };
  }, [sessionId]);

  function addQuestion(text, priority) {
    const q = {
      id: `q_${Date.now()}`,
      text: text.trim(),
      priority: priority || "normal",
      ts: new Date().toISOString(),
    };
    const by = { ...(draft.questionsByNode || {}) };
    const key = selectedNodeId || "__process__";
    const cur = Array.isArray(by[key]) ? by[key] : [];
    by[key] = [...cur, q];
    setDraft({ ...draft, questionsByNode: by });
  }

  const nodeLabel = useMemo(() => {
    const n = nodes.find((x) => String(x?.id) === String(selectedNodeId));
    return n?.title || n?.label || "";
  }, [nodes, selectedNodeId]);

  return (
    <>
      <div className="fab">
        <button className={"btn btnPrimary btnIcon"} title="AI Copilot" onClick={() => setOpen((v) => !v)}>
          ✦
        </button>
      </div>

      {open ? (
        <div className="panel copilotPanel">
          <div className="panelHead">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span>AI Copilot</span>
              <span className="statusPill" style={{ padding: "4px 8px" }}>
                <span className={"statusDot " + (sessionId && !String(sessionId).startsWith("local_") ? "ok" : "warn")} />
                <span className="small muted">{sessionId && !String(sessionId).startsWith("local_") ? "API-сессия" : "локально"}</span>
              </span>
            </div>
            <button className="btn btnIcon" onClick={() => setOpen(false)} title="Закрыть">×</button>
          </div>

          <div className="panelBody" style={{ display: "grid", gap: 12 }}>
            <div className="dod">
              <div className="dot info" />
              <div style={{ display: "grid", gap: 2 }}>
                <div style={{ fontWeight: 900 }}>Интервью: вопросы</div>
                <div className="kpi">Сейчас Copilot не привязан к кликам по BPMN. Следующий шаг — привязка к узлам.</div>
              </div>
            </div>

            <div className="node" data-status="info" data-selected="true">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 900 }}>
                  {selectedNodeId ? (nodeLabel ? nodeLabel : `Узел: ${selectedNodeId}`) : "Процесс (общие вопросы)"}
                </div>
                <div className="small muted">{selectedNodeId ? "узел" : "процесс"}</div>
              </div>

              <div className="hr" />

              {apiErr ? (
                <div className="small" style={{ color: "var(--warn)" }}>
                  Не удалось загрузить nodes из API: <span className="muted">{apiErr}</span>
                </div>
              ) : null}

              <div className="small muted" style={{ marginBottom: 8 }}>Контекст</div>

              <select
                className="input"
                value={selectedNodeId}
                onChange={(e) => setDraft({ ...draft, selectedNodeId: e.target.value })}
              >
                <option value="">— общий контекст процесса —</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title || n.label || n.id}
                  </option>
                ))}
              </select>

              <div className="hr" />

              <div className="small muted" style={{ marginBottom: 8 }}>Вопросы</div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {questions.length === 0 ? (
                  <div className="small muted">Пока вопросов нет.</div>
                ) : (
                  questions.slice().reverse().map((q) => (
                    <span key={q.id} className="pill" data-priority={q.priority === "high" ? "high" : "normal"}>
                      {q.text}
                    </span>
                  ))
                )}
              </div>

              <div className="input-row">
                <input
                  className="input"
                  placeholder="Добавить вопрос (например: температура/время/оборудование?)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = e.currentTarget.value;
                      if (v.trim().length) addQuestion(v, "normal");
                      e.currentTarget.value = "";
                    }
                  }}
                />
                <button
                  className="btn btnPrimary"
                  onClick={(e) => {
                    const inp = e.currentTarget.parentElement?.querySelector("input");
                    const v = inp?.value || "";
                    if (v.trim().length) addQuestion(v, "normal");
                    if (inp) inp.value = "";
                  }}
                >
                  Добавить
                </button>
              </div>

              <div className="small muted" style={{ marginTop: 10 }}>
                Подсказка: ввести текст и нажать Enter.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
EOF

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== commit (frontend only) =="
git add -A frontend
git status -sb || true
git commit -m "feat(frontend): graphite glass theme + bring back AI Copilot panel + fix bpmn ref warning + apiSaveSession" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R12 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact (exclude node_modules/dist) =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend -x "frontend/node_modules/*" -x "frontend/dist/*" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG_START\""
