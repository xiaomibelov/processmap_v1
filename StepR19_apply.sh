\
#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="feat/frontend-r19-bind-buttons-ai-to-backend-v1"
TAG_START="cp/foodproc_frontend_r19_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r19_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r19_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R19 start (${TS})" >/dev/null 2>&1 || true
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
echo "== write: frontend/src/lib/draft.js (extend draft shape) =="
cat > frontend/src/lib/draft.js <<'EOF'
import { readJson, writeJson } from "./storage";

export const LS_KEY = "fp_copilot_draft_v0";

export function readDraft() {
  return readJson(LS_KEY, null);
}

export function writeDraft(draft) {
  writeJson(LS_KEY, draft);
}

export function ensureDraftShape(d) {
  if (!d || typeof d !== "object") return null;

  const roles = Array.isArray(d.roles) ? d.roles : [];
  const notes = Array.isArray(d.notes) ? d.notes : [];
  const nodes = Array.isArray(d.nodes) ? d.nodes : [];
  const edges = Array.isArray(d.edges) ? d.edges : [];
  const questions = Array.isArray(d.questions) ? d.questions : [];

  return {
    session_id: typeof d.session_id === "string" ? d.session_id : "",
    title: typeof d.title === "string" ? d.title : "",
    roles,
    start_role: typeof d.start_role === "string" ? d.start_role : "",
    notes,
    nodes,
    edges,
    questions,
    ai_open: typeof d.ai_open === "boolean" ? d.ai_open : true,
    mode: typeof d.mode === "string" ? d.mode : "deep_audit",
    version: typeof d.version === "number" ? d.version : 0,
  };
}

export function defaultDraft() {
  return {
    session_id: "",
    title: "",
    roles: [],
    start_role: "",
    notes: [],
    nodes: [],
    edges: [],
    questions: [],
    ai_open: true,
    mode: "deep_audit",
    version: 0,
  };
}

export function hasActors(draft) {
  return (
    !!draft &&
    Array.isArray(draft.roles) &&
    draft.roles.length > 0 &&
    typeof draft.start_role === "string" &&
    draft.start_role.length > 0
  );
}
EOF

echo
echo "== write: frontend/src/components/NotesPanel.jsx (generate + notes on the left) =="
cat > frontend/src/components/NotesPanel.jsx <<'EOF'
import { useMemo, useState } from "react";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

export default function NotesPanel({
  draft,
  onGenerate,
  generating,
  onAddNote,
  addNoteDisabled,
  errorText,
}) {
  const roles = Array.isArray(draft?.roles) ? draft.roles : [];
  const notes = Array.isArray(draft?.notes) ? draft.notes : [];
  const startRole = typeof draft?.start_role === "string" ? draft.start_role : "";
  const sessionId = typeof draft?.session_id === "string" ? draft.session_id : "";

  const canGenerate = !!sessionId && !isLocalSessionId(sessionId);

  const [text, setText] = useState("");

  const notesRev = useMemo(() => notes.slice().reverse(), [notes]);

  return (
    <div className="panel">
      <div className="panelHead">Сессия</div>

      <div className="panelBody">
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Акторы</div>

          {roles.length === 0 ? (
            <div className="small muted">Пока нет ролей.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {roles.map((r) => (
                <div key={r.role_id} className="small">
                  <span style={{ fontWeight: 900 }}>{r.label}</span>{" "}
                  <span className="muted">({r.role_id})</span>
                </div>
              ))}
            </div>
          )}

          <div className="hr" />

          <div className="small">
            <span className="muted">start_role:</span>{" "}
            <span style={{ fontWeight: 900 }}>{startRole || "—"}</span>
          </div>
        </div>

        <button
          className="primaryBtn"
          disabled={!canGenerate || generating}
          onClick={canGenerate ? onGenerate : undefined}
          title={
            !canGenerate
              ? "Создай API-сессию (кнопка “New API”), чтобы генерировать процесс на бэке"
              : ""
          }
        >
          {generating ? "Генерация…" : "Сгенерировать процесс"}
        </button>

        {errorText ? (
          <div
            className="card"
            style={{
              marginTop: 10,
              borderColor: "rgba(255,77,77,.35)",
              background: "rgba(255,77,77,.08)",
            }}
          >
            <div className="small" style={{ fontWeight: 900, marginBottom: 4 }}>
              Ошибка
            </div>
            <div className="small">{errorText}</div>
          </div>
        ) : null}

        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Заметки</div>

          <div className="inputRow" style={{ alignItems: "stretch" }}>
            <textarea
              className="input"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Коротко: что важно уточнить, что проверить, какие допуски…"
              style={{ resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              className="btn"
              disabled={addNoteDisabled || !text.trim()}
              onClick={() => {
                const t = text.trim();
                if (!t) return;
                onAddNote?.(t);
                setText("");
              }}
            >
              Добавить
            </button>

            <div className="small muted" style={{ alignSelf: "center" }}>
              Кол-во: <span style={{ fontWeight: 900 }}>{notes.length}</span>
            </div>
          </div>

          {notes.length === 0 ? (
            <div className="small muted" style={{ marginTop: 10 }}>
              Пока заметок нет.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 10,
                marginTop: 12,
                maxHeight: 340,
                overflow: "auto",
              }}
            >
              {notesRev.slice(0, 20).map((n) => (
                <div key={n.note_id} className="noteLine">
                  <div className="muted" style={{ fontSize: 11 }}>
                    {n?.ts ? new Date(n.ts).toLocaleString() : "—"}
                  </div>
                  <div className="small">{n.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!canGenerate ? (
          <div className="small muted" style={{ marginTop: 12 }}>
            Подсказка: для генерации процесса нужна API-сессия (TopBar → “New API”).
          </div>
        ) : null}
      </div>
    </div>
  );
}
EOF

echo
echo "== write: frontend/src/components/BottomDock.jsx (minimize; remove note composer) =="
cat > frontend/src/components/BottomDock.jsx <<'EOF'
export default function BottomDock() {
  return (
    <div className="bottomDock">
      <div className="dockHint">
        <span style={{ fontWeight: 900 }}>Навигация:</span>{" "}
        <span className="muted">мышь — пан/зум на схеме · ✦ AI — включить вопросы на узлах</span>
      </div>
    </div>
  );
}
EOF

echo
echo "== write: frontend/src/components/process/NodeCopilotCard.jsx (Graphite Glass + backend-ready shape) =="
cat > frontend/src/components/process/NodeCopilotCard.jsx <<'EOF'
import { useMemo, useState } from "react";

export default function NodeCopilotCard({
  nodeId,
  title,
  roles,
  meta,
  questions,
  onClose,
  onSetRole,
  onAddQuestion,
  busy,
}) {
  const [q, setQ] = useState("");

  const roleLabel = useMemo(() => {
    const id = meta?.actor_role || "";
    const r = (roles || []).find((x) => x.role_id === id);
    return r ? r.label : "";
  }, [meta, roles]);

  const openCount = useMemo(() => {
    return (questions || []).filter((x) => x.status !== "answered" && x.status !== "skipped").length;
  }, [questions]);

  return (
    <div className="panel nodeCard" data-selected="true">
      <div className="node" data-status={openCount > 0 ? "warn" : "ok"}>
        <div className="nodeTop">
          <div style={{ minWidth: 0 }}>
            <div className="nodeTitle" title={title || nodeId}>
              {title || "Шаг процесса"}
            </div>
            <div className="nodeSub">
              <span className="muted">node_id:</span>{" "}
              <span style={{ fontWeight: 800 }}>{nodeId}</span>
              {roleLabel ? (
                <>
                  {" "}
                  · <span className="muted">роль:</span>{" "}
                  <span style={{ fontWeight: 800 }}>{roleLabel}</span>
                </>
              ) : null}
            </div>
          </div>

          <button className="iconBtn" onClick={onClose} title="Закрыть">
            ✕
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>
            Исполнитель (lane)
          </div>

          <select
            className="input"
            value={meta?.actor_role || ""}
            onChange={(e) => onSetRole?.(e.target.value)}
            disabled={busy}
          >
            <option value="">— выбери роль —</option>
            {(roles || []).map((r) => (
              <option key={r.role_id} value={r.role_id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="small muted" style={{ marginBottom: 8 }}>
            AI-вопросы (привязаны к узлу)
          </div>

          {(questions || []).length === 0 ? (
            <div className="small muted">Пока вопросов нет. Добавь 1–2 “первых” вопроса.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(questions || []).slice(0, 12).map((x) => (
                <span
                  key={x.id}
                  className="pill"
                  data-priority={x.priority === "high" ? "high" : "normal"}
                  title={x.text}
                >
                  {x.text}
                </span>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Напр.: Какая температура? Допуск? Что делаем при отклонении?"
              disabled={busy}
            />
            <button
              className="btn"
              disabled={busy || !q.trim()}
              onClick={() => {
                const t = q.trim();
                if (!t) return;
                onAddQuestion?.(t);
                setQ("");
              }}
            >
              Добавить
            </button>
          </div>

          <div className="dod" style={{ marginTop: 12 }}>
            <div className="dot warn" />
            <div className="kpi">
              Open: <span style={{ fontWeight: 900 }}>{openCount}</span>
            </div>
            <div className="kpi muted">
              Подсказка: заполняй “критерий готово”, “допуски”, “исключения”, “данные”.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
EOF

echo
echo "== write: frontend/src/components/process/BpmnStage.jsx (AI badges on nodes + softer BPMN colors) =="
cat > frontend/src/components/process/BpmnStage.jsx <<'EOF'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import BpmnJS from "bpmn-js/lib/NavigatedViewer";
import { apiGetBpmn } from "../../lib/api";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

const LOCAL_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
 xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
 xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
 xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
 xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
 id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт"/>
    <bpmn:task id="n_demo_1" name="Шаг (пример)"/>
    <bpmn:endEvent id="EndEvent_1" name="Конец"/>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="n_demo_1"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="n_demo_1" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="200" y="140" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="n_demo_1">
        <dc:Bounds x="300" y="120" width="160" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="500" y="140" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="236" y="158"/>
        <di:waypoint x="300" y="160"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="460" y="160"/>
        <di:waypoint x="500" y="158"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;

function isFlowNode(el) {
  const t = el?.type || "";
  return (
    t === "bpmn:Task" ||
    t === "bpmn:UserTask" ||
    t === "bpmn:ManualTask" ||
    t === "bpmn:ServiceTask" ||
    t === "bpmn:ScriptTask" ||
    t === "bpmn:BusinessRuleTask" ||
    t === "bpmn:SendTask" ||
    t === "bpmn:ReceiveTask" ||
    t === "bpmn:CallActivity" ||
    t === "bpmn:SubProcess"
  );
}

const BpmnStage = forwardRef(function BpmnStage(
  { sessionId, reloadKey = 0, aiEnabled = true, questions = [], selectedNodeId = "", onElementClick },
  ref
) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);
  const overlayIdsRef = useRef([]);
  const [ready, setReady] = useState(false);

  const openCountByNodeId = useMemo(() => {
    const map = new Map();
    (questions || []).forEach((q) => {
      const nodeId = q?.node_id;
      if (!nodeId) return;
      const st = q?.status || "open";
      const isOpen = st !== "answered" && st !== "skipped";
      if (!isOpen) return;
      map.set(nodeId, (map.get(nodeId) || 0) + 1);
    });
    return map;
  }, [questions]);

  useImperativeHandle(ref, () => ({
    zoomIn() {
      const v = viewerRef.current;
      if (!v) return;
      const canvas = v.get("canvas");
      const z = canvas.zoom() || 1;
      canvas.zoom(z * 1.15);
    },
    zoomOut() {
      const v = viewerRef.current;
      if (!v) return;
      const canvas = v.get("canvas");
      const z = canvas.zoom() || 1;
      canvas.zoom(z / 1.15);
    },
    fit() {
      const v = viewerRef.current;
      if (!v) return;
      v.get("canvas").zoom("fit-viewport");
    },
  }));

  // init viewer once
  useEffect(() => {
    if (!hostRef.current) return;

    const viewer = new BpmnJS({ container: hostRef.current });
    viewerRef.current = viewer;

    viewer.on("element.click", (e) => {
      const el = e?.element;
      if (!el || !isFlowNode(el)) return;
      onElementClick?.(e);
    });

    return () => {
      try {
        viewer.destroy();
      } catch {}
      viewerRef.current = null;
    };
  }, [onElementClick]);

  // import XML when sessionId/reloadKey changes
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;

    let cancelled = false;
    setReady(false);

    async function run() {
      try {
        const xml = !sessionId
          ? LOCAL_BPMN_XML
          : isLocalSessionId(sessionId)
          ? LOCAL_BPMN_XML
          : await apiGetBpmn(sessionId);

        if (cancelled) return;

        await v.importXML(xml);
        v.get("canvas").zoom("fit-viewport");
        setReady(true);
      } catch (err) {
        console.warn("bpmn import failed:", err);
        setReady(true);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [sessionId, reloadKey]);

  // overlays: AI badges + selected marker
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !ready) return;

    const overlays = v.get("overlays");
    const elementRegistry = v.get("elementRegistry");
    const canvas = v.get("canvas");

    // cleanup old overlays
    overlayIdsRef.current.forEach((id) => {
      try {
        overlays.remove(id);
      } catch {}
    });
    overlayIdsRef.current = [];

    // markers
    try {
      canvas.removeMarker(selectedNodeId, "is-selected");
    } catch {}
    if (selectedNodeId) {
      try {
        canvas.addMarker(selectedNodeId, "is-selected");
      } catch {}
    }

    if (!aiEnabled) return;

    const elements = elementRegistry.getAll().filter(isFlowNode);

    elements.forEach((el) => {
      const count = openCountByNodeId.get(el.id) || 0;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bpmnAiBadge";
      btn.textContent = count > 0 ? `AI ${count}` : "AI";
      btn.title = count > 0 ? `Открытых вопросов: ${count}` : "AI Copilot";
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onElementClick?.({ element: el });
      });

      try {
        const oid = overlays.add(el.id, { position: { top: -10, right: -10 }, html: btn });
        overlayIdsRef.current.push(oid);
      } catch {}
    });
  }, [ready, aiEnabled, openCountByNodeId, selectedNodeId, onElementClick]);

  return <div className="bpmnStage" ref={hostRef} />;
});

export default BpmnStage;
EOF

echo
echo "== write: frontend/src/components/ProcessStage.jsx (AI toggle + patch draft on node edits) =="
cat > frontend/src/components/ProcessStage.jsx <<'EOF'
import { useEffect, useMemo, useRef, useState } from "react";
import BpmnStage from "./process/BpmnStage";
import NodeCopilotCard from "./process/NodeCopilotCard";
import { uid } from "../lib/ids";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

function isFlowNode(el) {
  const t = el?.type || "";
  return (
    t === "bpmn:Task" ||
    t === "bpmn:UserTask" ||
    t === "bpmn:ManualTask" ||
    t === "bpmn:ServiceTask" ||
    t === "bpmn:ScriptTask" ||
    t === "bpmn:BusinessRuleTask" ||
    t === "bpmn:SendTask" ||
    t === "bpmn:ReceiveTask" ||
    t === "bpmn:CallActivity" ||
    t === "bpmn:SubProcess"
  );
}

export default function ProcessStage({ sessionId, locked, draft, onPatchDraft, reloadKey }) {
  const bpmnRef = useRef(null);
  const stageRef = useRef(null);

  const roles = Array.isArray(draft?.roles) ? draft.roles : [];
  const questions = Array.isArray(draft?.questions) ? draft.questions : [];
  const nodes = Array.isArray(draft?.nodes) ? draft.nodes : [];

  const [selected, setSelected] = useState(null); // { id,title, bbox, el }
  const [pos, setPos] = useState({ left: 18, top: 18 });
  const [busy, setBusy] = useState(false);

  const aiEnabled = !!draft?.ai_open;

  const questionsForSelected = useMemo(() => {
    const id = selected?.id;
    if (!id) return [];
    return questions.filter((q) => q.node_id === id);
  }, [questions, selected]);

  const metaForSelected = useMemo(() => {
    const id = selected?.id;
    if (!id) return null;
    return nodes.find((n) => n.id === id) || { id };
  }, [nodes, selected]);

  useEffect(() => {
    if (!selected?.id) return;
    const host = stageRef.current;
    if (!host) return;

    const bbox = selected?.bbox;
    if (!bbox) return;

    const rect = host.getBoundingClientRect();
    const left = Math.min(Math.max(18, bbox.x + bbox.width + 18), rect.width - 380);
    const top = Math.min(Math.max(18, bbox.y - 6), rect.height - 420);
    setPos({ left, top });
  }, [selected]);

  function patchDraft(mutator) {
    if (!onPatchDraft) return;
    setBusy(true);
    try {
      const next = mutator(structuredClone(draft || {}));
      Promise.resolve(onPatchDraft(next)).finally(() => setBusy(false));
    } catch {
      setBusy(false);
    }
  }

  function ensureNode(d, nodeId, fallbackTitle) {
    if (!Array.isArray(d.nodes)) d.nodes = [];
    const idx = d.nodes.findIndex((n) => n.id === nodeId);
    if (idx !== -1) return d.nodes[idx];

    const node = {
      id: nodeId,
      title: fallbackTitle || "Шаг",
      type: "step",
      actor_role: "",
      recipient_role: null,
      equipment: [],
      duration_min: null,
      parameters: {},
      disposition: {},
    };
    d.nodes.push(node);
    return node;
  }

  function ensureQuestions(d) {
    if (!Array.isArray(d.questions)) d.questions = [];
    return d.questions;
  }

  const canWriteApi = !!sessionId && !isLocalSessionId(sessionId);

  return (
    <div className="stageInner" ref={stageRef}>
      <div className="stageHead">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="processTitle">Процесс</div>
          {!canWriteApi ? (
            <span className="badge muted">local</span>
          ) : (
            <span className="badge ok">api</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="iconBtn" onClick={() => bpmnRef.current?.zoomOut()} title="Zoom out">
            −
          </button>
          <button className="iconBtn" onClick={() => bpmnRef.current?.fit()} title="Fit">
            ⤢
          </button>
          <button className="iconBtn" onClick={() => bpmnRef.current?.zoomIn()} title="Zoom in">
            +
          </button>

          <button
            className={"btn" + (aiEnabled ? " btnOn" : "")}
            onClick={() => {
              patchDraft((d) => {
                d.ai_open = !aiEnabled;
                return d;
              });
              if (aiEnabled) setSelected(null);
            }}
            disabled={locked}
            title="Показывать AI-бейджи на узлах"
          >
            ✦ AI
          </button>
        </div>
      </div>

      <BpmnStage
        ref={bpmnRef}
        sessionId={sessionId}
        reloadKey={reloadKey}
        aiEnabled={aiEnabled}
        questions={questions}
        selectedNodeId={selected?.id || ""}
        onElementClick={(e) => {
          if (locked) return;
          const el = e?.element;
          if (!el || !isFlowNode(el)) return;

          // AI open only when AI enabled (no auto-open)
          if (!aiEnabled) return;

          const title = el.businessObject?.name || el.id;

          const bbox = el?.di?.bounds
            ? { x: el.di.bounds.x || 0, y: el.di.bounds.y || 0, width: el.di.bounds.width || 0, height: el.di.bounds.height || 0 }
            : null;

          setSelected({ id: el.id, title, bbox, el });
        }}
      />

      {selected?.id && aiEnabled ? (
        <div style={{ position: "absolute", left: pos.left, top: pos.top, width: 360, zIndex: 80 }}>
          <NodeCopilotCard
            nodeId={selected.id}
            title={selected.title}
            roles={roles}
            meta={metaForSelected}
            questions={questionsForSelected}
            busy={busy || !canWriteApi}
            onClose={() => setSelected(null)}
            onSetRole={(roleId) => {
              patchDraft((d) => {
                const node = ensureNode(d, selected.id, selected.title);
                node.actor_role = roleId || "";
                return d;
              });
            }}
            onAddQuestion={(text) => {
              patchDraft((d) => {
                ensureNode(d, selected.id, selected.title);
                const qs = ensureQuestions(d);
                qs.push({
                  id: uid("q"),
                  node_id: selected.id,
                  issue_type: "other",
                  text,
                  priority: "normal",
                  status: "open",
                  answer: null,
                });
                return d;
              });
            }}
          />

          {!canWriteApi ? (
            <div className="small muted" style={{ marginTop: 10 }}>
              Подсказка: AI-сущности сохраняются на бэке только в API-сессии (TopBar → “New API”).
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
EOF

echo
echo "== write: frontend/src/components/AppShell.jsx (pass draft + reloadKey to ProcessStage) =="
cat > frontend/src/components/AppShell.jsx <<'EOF'
import TopBar from "./TopBar";
import BottomDock from "./BottomDock";
import ProcessStage from "./ProcessStage";

export default function AppShell({
  sessionId,
  apiOk,
  apiBase,
  sessions,
  onSelectSession,
  onNewLocalSession,
  onNewApiSession,
  left,
  locked,
  draft,
  onPatchDraft,
  bpmnReloadKey,
}) {
  return (
    <div className="app">
      <TopBar
        apiOk={apiOk}
        apiBase={apiBase}
        sessions={sessions}
        sessionId={sessionId}
        onSelectSession={onSelectSession}
        onNewLocalSession={onNewLocalSession}
        onNewApiSession={onNewApiSession}
      />

      <div className="workspace">
        <div className="leftCol">{left}</div>

        <div className="stage">
          <ProcessStage
            sessionId={sessionId}
            locked={locked}
            draft={draft}
            onPatchDraft={onPatchDraft}
            reloadKey={bpmnReloadKey}
          />
        </div>
      </div>

      <BottomDock />
    </div>
  );
}
EOF

echo
echo "== write: frontend/src/App.jsx (bind generate + notes + patch to backend) =="
cat > frontend/src/App.jsx <<'EOF'
import { useEffect, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import NotesPanel from "./components/NotesPanel";
import NoSession from "./components/stages/NoSession";
import ActorsSetup from "./components/stages/ActorsSetup";
import { uid } from "./lib/ids";
import { defaultDraft, ensureDraftShape, hasActors, readDraft, writeDraft } from "./lib/draft";
import { apiCreateSession, apiGetSession, apiListSessions, apiMeta, apiPostNote, apiSaveSession } from "./lib/api";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

export default function App() {
  const initial = useMemo(() => ensureDraftShape(readDraft()) || defaultDraft(), []);
  const [draft, setDraft] = useState(initial);

  const [apiOk, setApiOk] = useState(false);
  const [apiBase, setApiBase] = useState("");
  const [sessions, setSessions] = useState([]);

  const [bpmnReloadKey, setBpmnReloadKey] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [errorText, setErrorText] = useState("");

  const phase = !draft.session_id ? "no_session" : hasActors(draft) ? "interview" : "actors_setup";
  const locked = phase !== "interview";

  function updateDraft(next) {
    setDraft(next);
    writeDraft(next);
  }

  async function refreshSessionsSafe() {
    try {
      const list = await apiListSessions();
      if (Array.isArray(list)) setSessions(list);
    } catch {}
  }

  useEffect(() => {
    (async () => {
      try {
        const meta = await apiMeta();
        setApiOk(true);
        setApiBase(meta?.api_base || "");
      } catch {
        setApiOk(false);
      }
      refreshSessionsSafe();
    })();
  }, []);

  async function selectApiSession(sessionId) {
    setErrorText("");
    try {
      const s = await apiGetSession(sessionId);
      const shaped = ensureDraftShape(s) || defaultDraft();
      updateDraft(shaped);
      setBpmnReloadKey((x) => x + 1);
    } catch (e) {
      setErrorText(String(e?.message || e || "Не удалось загрузить сессию"));
    }
  }

  function createLocalSession() {
    setErrorText("");
    const session_id = `local_${Date.now()}`;
    updateDraft({ ...defaultDraft(), session_id, title: "Local session" });
    setBpmnReloadKey((x) => x + 1);
  }

  async function createApiSession() {
    setErrorText("");
    try {
      const s = await apiCreateSession({ title: "Новый процесс" });
      const shaped = ensureDraftShape(s) || defaultDraft();
      updateDraft(shaped);
      await refreshSessionsSafe();
      setBpmnReloadKey((x) => x + 1);
    } catch (e) {
      setErrorText(String(e?.message || e || "Не удалось создать API-сессию"));
    }
  }

  async function patchDraftToBackend(nextDraft) {
    updateDraft(nextDraft);

    const id = nextDraft.session_id;
    if (!id || isLocalSessionId(id)) return nextDraft;

    try {
      const saved = await apiSaveSession(id, nextDraft); // PATCH full shape
      const shaped = ensureDraftShape(saved) || nextDraft;
      updateDraft(shaped);
      return shaped;
    } catch (e) {
      setErrorText(String(e?.message || e || "Ошибка сохранения на бэке"));
      return nextDraft;
    }
  }

  async function saveActors({ roles, start_role }) {
    const next = { ...draft, roles, start_role };
    await patchDraftToBackend(next);
  }

  async function addNote(text) {
    setErrorText("");
    const note = { note_id: uid("note"), ts: new Date().toISOString(), author: "user", text };

    const next = { ...draft, notes: [...(draft.notes || []), note] };
    updateDraft(next);

    const id = next.session_id;
    if (!id || isLocalSessionId(id)) return;

    try {
      await apiPostNote(id, text);
      // sync back (server может нормализовать)
      const s = await apiGetSession(id);
      const shaped = ensureDraftShape(s) || next;
      updateDraft(shaped);
    } catch (e) {
      // fallback: try patch full draft
      await patchDraftToBackend(next);
    }
  }

  async function generateProcess() {
    setErrorText("");
    if (!draft.session_id || isLocalSessionId(draft.session_id)) {
      setErrorText("Нужна API-сессия (TopBar → “New API”), чтобы генерировать BPMN на бэке.");
      return;
    }

    setGenerating(true);
    try {
      await patchDraftToBackend(draft);
      setBpmnReloadKey((x) => x + 1);
    } finally {
      setGenerating(false);
    }
  }

  const left =
    phase === "no_session" ? (
      <NoSession onCreateLocal={createLocalSession} />
    ) : phase === "actors_setup" ? (
      <ActorsSetup draft={draft} onSaveActors={saveActors} />
    ) : (
      <NotesPanel
        draft={draft}
        onGenerate={generateProcess}
        generating={generating}
        onAddNote={addNote}
        addNoteDisabled={locked}
        errorText={errorText}
      />
    );

  return (
    <AppShell
      sessionId={draft.session_id}
      apiOk={apiOk}
      apiBase={apiBase}
      sessions={sessions}
      onSelectSession={selectApiSession}
      onNewLocalSession={createLocalSession}
      onNewApiSession={createApiSession}
      left={left}
      locked={locked}
      draft={draft}
      onPatchDraft={patchDraftToBackend}
      bpmnReloadKey={bpmnReloadKey}
    />
  );
}
EOF

echo
echo "== write: frontend/src/styles/theme_graphite.css (fix Process title + soften BPMN) =="
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

html, body{
  color:var(--text);
  background:
    radial-gradient(1100px 650px at 18% 12%, rgba(124,92,255,.18), transparent 60%),
    radial-gradient(900px 500px  at 80% 18%, rgba(47,229,140,.10), transparent 55%),
    linear-gradient(180deg,var(--bg0),var(--bg1));
}

a{ color: inherit; }

.panel{
  background:var(--panel) !important;
  border:1px solid var(--border) !important;
  border-radius:var(--r-lg) !important;
  box-shadow:var(--shadow) !important;
  backdrop-filter: blur(14px);
}

.panelHead{
  color: var(--text) !important;
}

.panelBody{
  color: var(--text) !important;
}

.small{ color: var(--text) !important; }
.muted{ color: var(--muted) !important; }

.hr{
  border-color: rgba(255,255,255,.12) !important;
}

.card{
  background: var(--panel2) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--r-md) !important;
  box-shadow: none !important;
}

.btn, .primaryBtn, .iconBtn{
  color: var(--text) !important;
  background: rgba(255,255,255,.06) !important;
  border: 1px solid rgba(255,255,255,.12) !important;
  border-radius: 12px !important;
}
.btn:hover, .primaryBtn:hover, .iconBtn:hover{
  border-color: rgba(255,255,255,.18) !important;
}

.primaryBtn{
  background: rgba(124,92,255,.16) !important;
  border-color: rgba(124,92,255,.30) !important;
}
.primaryBtn:disabled{ opacity: .55; }

.btnOn{
  background: rgba(124,92,255,.22) !important;
  border-color: rgba(124,92,255,.35) !important;
}

.badge{
  display:inline-flex;
  align-items:center;
  height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.05);
  font-size: 12px;
}
.badge.ok{
  border-color: rgba(47,229,140,.30);
  background: rgba(47,229,140,.10);
}
.badge.muted{
  border-color: rgba(255,255,255,.12);
  background: rgba(255,255,255,.04);
}

.stage{
  background: rgba(255,255,255,.02) !important;
  border: 1px solid rgba(255,255,255,.10) !important;
  border-radius: var(--r-lg) !important;
  overflow: hidden;
}
.stageHead, .stageHead *{
  color: var(--text) !important;
}
.processTitle{
  font-size: 14px;
  font-weight: 900;
  letter-spacing: .2px;
}

.bottomDock{
  background: rgba(255,255,255,.04) !important;
  border-top: 1px solid rgba(255,255,255,.10) !important;
}
.dockHint{
  padding: 10px 14px;
  font-size: 12px;
  color: var(--muted);
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
.inputRow{ display:flex; gap:10px; }

/* Node card styles */
.node{
  position:relative;
  padding:12px 12px 10px;
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

.nodeTop{
  display:flex;
  justify-content:space-between;
  gap:10px;
  align-items:flex-start;
}
.nodeTitle{
  font-weight: 900;
  font-size: 14px;
  white-space: nowrap;
  overflow:hidden;
  text-overflow: ellipsis;
}
.nodeSub{
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}

.pill{
  display:inline-flex; align-items:center; gap:8px;
  padding:6px 10px;
  border-radius:999px;
  background: rgba(124,92,255,.14);
  border:1px solid rgba(124,92,255,.22);
  color: var(--text);
  font-size:12px;
  max-width: 320px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pill[data-priority="high"]{
  background: rgba(255,77,77,.14);
  border-color: rgba(255,77,77,.24);
}

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

/* BPMN viewer: make it darker and less bright */
.bpmnStage .djs-container{
  background:
    radial-gradient(900px 540px at 18% 10%, rgba(124,92,255,.10), transparent 65%),
    radial-gradient(700px 420px at 78% 16%, rgba(47,229,140,.06), transparent 62%),
    linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.02)) !important;
}
.bpmnStage .djs-visual rect,
.bpmnStage .djs-visual polygon,
.bpmnStage .djs-visual circle,
.bpmnStage .djs-visual ellipse{
  fill: rgba(255,255,255,.05) !important;
  stroke: rgba(255,255,255,.22) !important;
}
.bpmnStage .djs-visual path{
  stroke: rgba(255,255,255,.32) !important;
}
.bpmnStage .djs-visual text{
  fill: rgba(255,255,255,.85) !important;
}

/* Selected marker */
.djs-element.is-selected .djs-visual rect,
.djs-element.is-selected .djs-visual polygon,
.djs-element.is-selected .djs-visual circle,
.djs-element.is-selected .djs-visual ellipse{
  stroke: rgba(124,92,255,.80) !important;
}

/* AI badge overlays */
.bpmnAiBadge{
  cursor: pointer;
  border: 1px solid rgba(124,92,255,.35);
  background: rgba(124,92,255,.18);
  color: var(--text);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 900;
  box-shadow: 0 8px 22px rgba(0,0,0,.40);
}
.bpmnAiBadge:hover{
  border-color: rgba(124,92,255,.55);
}

/* Node card wrapper */
.nodeCard{
  box-shadow: 0 18px 55px rgba(0,0,0,.55) !important;
}
.noteLine{
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.08);
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
git commit -m "feat(frontend): bind generate/notes/ai to backend session + graphite UI + BPMN AI badges" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R19 done (${TS})" >/dev/null 2>&1 || true
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
