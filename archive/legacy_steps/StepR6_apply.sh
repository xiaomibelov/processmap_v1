#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="feat/frontend-r6-node-copilot-overlay-v1"
TAG_START="cp/foodproc_frontend_r6_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r6_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r6_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R6 start (${TS})" >/dev/null 2>&1 || true
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
echo "== write node store (localStorage) =="
mkdir -p frontend/src/lib
cat > frontend/src/lib/nodeStore.js <<'EOF'
const KEY = "fpc_node_meta_v1";

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function safeStringify(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return "{}";
  }
}

function readAll() {
  const raw = localStorage.getItem(KEY);
  const obj = safeParse(raw || "");
  return obj && typeof obj === "object" ? obj : {};
}

function writeAll(obj) {
  localStorage.setItem(KEY, safeStringify(obj || {}));
}

function qid() {
  return `q_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getNodeMeta(nodeId) {
  if (!nodeId) return { role_id: "", questions: [] };
  const all = readAll();
  const m = all[nodeId];
  if (!m || typeof m !== "object") return { role_id: "", questions: [] };
  return {
    role_id: typeof m.role_id === "string" ? m.role_id : "",
    questions: Array.isArray(m.questions) ? m.questions : [],
  };
}

export function setNodeRole(nodeId, roleId) {
  if (!nodeId) return;
  const all = readAll();
  const cur = all[nodeId] && typeof all[nodeId] === "object" ? all[nodeId] : {};
  all[nodeId] = { ...cur, role_id: roleId || "" };
  writeAll(all);
}

export function addNodeQuestion(nodeId, text) {
  if (!nodeId) return;
  const t = (text || "").trim();
  if (!t) return;

  const all = readAll();
  const cur = all[nodeId] && typeof all[nodeId] === "object" ? all[nodeId] : {};
  const questions = Array.isArray(cur.questions) ? cur.questions : [];
  questions.push({ question_id: qid(), ts: new Date().toISOString(), text: t });
  all[nodeId] = { ...cur, questions };
  writeAll(all);
}

export function removeNodeQuestion(nodeId, questionId) {
  if (!nodeId || !questionId) return;
  const all = readAll();
  const cur = all[nodeId] && typeof all[nodeId] === "object" ? all[nodeId] : {};
  const questions = Array.isArray(cur.questions) ? cur.questions : [];
  all[nodeId] = { ...cur, questions: questions.filter((q) => q.question_id !== questionId) };
  writeAll(all);
}
EOF

echo
echo "== write NodeCopilotCard =="
mkdir -p frontend/src/components/process
cat > frontend/src/components/process/NodeCopilotCard.jsx <<'EOF'
import { useMemo, useState } from "react";

export default function NodeCopilotCard({
  element,
  roles,
  meta,
  onSetRole,
  onAddQuestion,
  onRemoveQuestion,
  onAddNote,
  onClose,
}) {
  const [qText, setQText] = useState("");
  const [noteText, setNoteText] = useState("");

  const title = useMemo(() => {
    const n = element?.name || "";
    return n.trim() ? n.trim() : (element?.id || "Node");
  }, [element]);

  const type = element?.type || "";
  const roleId = meta?.role_id || "";

  return (
    <div className="card" style={{ width: 340, maxWidth: 360 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 900 }}>AI Copilot: вопросы</div>
        <div className="spacer" />
        <button className="btn" onClick={onClose} title="Закрыть">×</button>
      </div>

      <div className="small muted" style={{ marginTop: 6 }}>
        <span style={{ fontWeight: 900 }}>{title}</span>{" "}
        <span className="muted">· {type}</span>
      </div>

      <div className="hr" />

      <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>Роль (ответственный)</div>
      <select
        className="input"
        value={roleId}
        onChange={(e) => onSetRole(element.id, e.target.value)}
      >
        <option value="">— не выбрано —</option>
        {Array.isArray(roles) ? roles.map((r) => (
          <option key={r.role_id} value={r.role_id}>
            {r.label} ({r.role_id})
          </option>
        )) : null}
      </select>

      <div className="hr" />

      <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>Вопрос</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          placeholder="Например: что считается входом/выходом шага?"
        />
        <button
          className="primaryBtn"
          style={{ whiteSpace: "nowrap" }}
          onClick={() => {
            onAddQuestion(element.id, qText);
            setQText("");
          }}
        >
          + Добавить
        </button>
      </div>

      {meta?.questions?.length ? (
        <div style={{ marginTop: 10, display: "grid", gap: 8, maxHeight: 160, overflow: "auto" }}>
          {meta.questions.slice().reverse().map((q) => (
            <div key={q.question_id} className="small" style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div className="muted" style={{ fontSize: 11 }}>{new Date(q.ts).toLocaleString()}</div>
                <div>{q.text}</div>
              </div>
              <button className="btn" onClick={() => onRemoveQuestion(element.id, q.question_id)} title="Удалить">🗑</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="small muted" style={{ marginTop: 10 }}>
          Вопросов пока нет.
        </div>
      )}

      <div className="hr" />

      <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>Быстрая заметка по узлу</div>
      <textarea
        className="input"
        style={{ height: 74, resize: "vertical" }}
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder="Коротко: условия, нюансы, исключения, контроль качества…"
      />
      <button
        className="primaryBtn"
        style={{ marginTop: 8, width: "100%" }}
        onClick={() => {
          const t = (noteText || "").trim();
          if (!t) return;
          onAddNote(`[node:${element.id}] ${t}`);
          setNoteText("");
        }}
      >
        В заметки
      </button>
    </div>
  );
}
EOF

echo
echo "== update BpmnStage: element click + viewbox change + ref API =="
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

async function fetchBpmnXml(sessionId) {
  if (!sessionId) return MOCK_XML;

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
  { sessionId, enabled, onElementClick, onViewportChange },
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
      getViewbox() {
        const v = viewerRef.current;
        if (!v) return null;
        return v.get("canvas").viewbox();
      },
      getElementBox(id) {
        const v = viewerRef.current;
        if (!v || !id) return null;
        const el = v.get("elementRegistry").get(id);
        if (!el) return null;
        return { x: el.x, y: el.y, width: el.width, height: el.height, id: el.id, type: el.type, businessObject: el.businessObject };
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
          if (typeof onElementClick === "function" && e && e.element) {
            onElementClick(e.element);
          }
        };

        const onVB = () => {
          if (!alive) return;
          if (typeof onViewportChange === "function") onViewportChange();
        };

        eventBus.on("element.click", onClick);
        eventBus.on("canvas.viewbox.changed", onVB);

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
  }, [sessionId, enabled, onElementClick, onViewportChange]);

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
echo "== update ProcessStage: node-click anchored copilot card =="
cat > frontend/src/components/ProcessStage.jsx <<'EOF'
import { useMemo, useRef, useState } from "react";
import BpmnStage from "./process/BpmnStage";
import NodeCopilotCard from "./process/NodeCopilotCard";
import { addNodeQuestion, getNodeMeta, removeNodeQuestion, setNodeRole } from "../lib/nodeStore";

function isFlowNode(el) {
  if (!el || typeof el.type !== "string") return false;
  const t = el.type;
  if (!t.startsWith("bpmn:")) return false;
  if (t === "bpmn:Lane" || t === "bpmn:Participant" || t === "bpmn:LaneSet") return false;
  // фокус на узлы процесса; edge клики игнорируем
  if (t.endsWith("Flow")) return false;
  return true;
}

export default function ProcessStage({ mode, sessionId, roles, onAddNote }) {
  const isInterview = mode === "interview";
  const bpmnRef = useRef(null);
  const stageRef = useRef(null);

  const [selected, setSelected] = useState(null);
  const [tick, setTick] = useState(0); // триггер для re-render после store update

  const meta = useMemo(() => {
    return selected?.id ? getNodeMeta(selected.id) : { role_id: "", questions: [] };
  }, [selected, tick]);

  const [pos, setPos] = useState({ left: 16, top: 16, side: "right" });

  function computePos(elementId) {
    const vb = bpmnRef.current?.getViewbox?.();
    const box = bpmnRef.current?.getElementBox?.(elementId);
    const host = stageRef.current;
    if (!vb || !box || !host) return;

    const scale = vb.scale || 1;
    const hostW = host.clientWidth || 0;
    const hostH = host.clientHeight || 0;

    const nodeRight = (box.x + box.width - vb.x) * scale;
    const nodeLeft = (box.x - vb.x) * scale;
    const nodeTop = (box.y - vb.y) * scale;

    const cardW = 360;
    const pad = 12;

    // по умолчанию справа от узла
    let left = nodeRight + pad;
    let side = "right";

    // если справа не влезает — ставим слева
    if (left + cardW > hostW - pad) {
      left = nodeLeft - pad - cardW;
      side = "left";
    }

    // clamp по границам
    left = Math.max(pad, Math.min(left, Math.max(pad, hostW - cardW - pad)));

    let top = nodeTop - 8;
    top = Math.max(pad, Math.min(top, Math.max(pad, hostH - 240)));

    setPos({ left, top, side });
  }

  function onElementClick(el) {
    if (!isInterview) return;
    if (!isFlowNode(el)) return;
    const bo = el.businessObject || {};
    const name = typeof bo.name === "string" ? bo.name : "";
    setSelected({ id: el.id, type: el.type, name });
    requestAnimationFrame(() => computePos(el.id));
  }

  function onViewportChange() {
    if (!selected?.id) return;
    requestAnimationFrame(() => computePos(selected.id));
  }

  function close() {
    setSelected(null);
  }

  return (
    <div className="panel processPanel">
      <div className="processHead">
        <div className="title">
          Процесс <span className="muted" style={{ fontWeight: 600 }}>(Workflow)</span>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => { bpmnRef.current?.zoomOut?.(); onViewportChange(); }} disabled={!isInterview}>−</button>
        <button className="btn" onClick={() => { bpmnRef.current?.zoomIn?.(); onViewportChange(); }} disabled={!isInterview}>+</button>
        <button className="btn" onClick={() => { bpmnRef.current?.fit?.(); onViewportChange(); }} disabled={!isInterview}>Fit</button>
      </div>

      <div className="processCanvas" ref={stageRef}>
        <BpmnStage
          ref={bpmnRef}
          sessionId={sessionId}
          enabled={isInterview}
          onElementClick={onElementClick}
          onViewportChange={onViewportChange}
        />

        {isInterview && selected ? (
          <div style={{ position: "absolute", left: pos.left, top: pos.top, zIndex: 20 }}>
            <NodeCopilotCard
              element={selected}
              roles={roles}
              meta={meta}
              onSetRole={(nodeId, roleId) => { setNodeRole(nodeId, roleId); setTick((x) => x + 1); }}
              onAddQuestion={(nodeId, text) => { addNodeQuestion(nodeId, text); setTick((x) => x + 1); }}
              onRemoveQuestion={(nodeId, qid) => { removeNodeQuestion(nodeId, qid); setTick((x) => x + 1); }}
              onAddNote={(t) => { if (typeof onAddNote === "function") onAddNote(t); }}
              onClose={close}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
EOF

echo
echo "== update AppShell: pass roles + onAddNote into ProcessStage =="
cat > frontend/src/components/AppShell.jsx <<'EOF'
import TopBar from "./TopBar";
import ProcessStage from "./ProcessStage";
import BottomDock from "./BottomDock";

export default function AppShell({
  sessionId,
  roles,
  mode,
  left,
  locked,
  notes,
  onAddNote,
  onNewLocalSession,
}) {
  return (
    <div className="shell">
      <TopBar
        sessionId={sessionId}
        onNewSession={onNewLocalSession}
        onOpenSession={() => {}}
      />

      <div className="workspace">
        {left}
        <ProcessStage mode={mode} sessionId={sessionId} roles={roles} onAddNote={onAddNote} />
      </div>

      <BottomDock locked={locked} notes={notes} onAddNote={onAddNote} />
    </div>
  );
}
EOF

echo
echo "== update App.jsx: pass roles into AppShell =="
cat > frontend/src/App.jsx <<'EOF'
import { useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import NotesPanel from "./components/NotesPanel";
import NoSession from "./components/stages/NoSession";
import ActorsSetup from "./components/stages/ActorsSetup";
import { uid } from "./lib/ids";
import { ensureDraftShape, hasActors, readDraft, writeDraft } from "./lib/draft";

export default function App() {
  const initial = useMemo(() => ensureDraftShape(readDraft()), []);
  const [draft, setDraft] = useState(
    initial || { session_id: "", title: "", roles: [], start_role: "", notes: [] }
  );

  const phase = !draft.session_id
    ? "no_session"
    : hasActors(draft)
      ? "interview"
      : "actors_setup";

  const locked = phase !== "interview";

  function updateDraft(next) {
    setDraft(next);
    writeDraft(next);
  }

  function createLocalSession() {
    const session_id = `local_${Date.now()}`;
    updateDraft({ session_id, title: "Local session", roles: [], start_role: "", notes: [] });
  }

  function saveActors({ roles, start_role }) {
    updateDraft({ ...draft, roles, start_role });
  }

  function addNote(text) {
    const note = {
      note_id: uid("note"),
      ts: new Date().toISOString(),
      author: "user",
      text,
    };
    updateDraft({ ...draft, notes: [...(draft.notes || []), note] });
  }

  const left =
    phase === "no_session" ? (
      <NoSession onCreateLocal={createLocalSession} />
    ) : phase === "actors_setup" ? (
      <ActorsSetup draft={draft} onSaveActors={saveActors} />
    ) : (
      <NotesPanel draft={draft} />
    );

  return (
    <AppShell
      sessionId={draft.session_id}
      roles={draft.roles || []}
      mode={phase}
      left={left}
      locked={locked}
      notes={draft.notes || []}
      onAddNote={addNote}
      onNewLocalSession={createLocalSession}
    />
  );
}
EOF

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
git commit -m "feat(frontend): node-anchored copilot card on BPMN click (R6)" 

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R6 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact (exclude node_modules/dist) =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend \
  -x "frontend/node_modules/*" \
  -x "frontend/dist/*" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG_START\""
