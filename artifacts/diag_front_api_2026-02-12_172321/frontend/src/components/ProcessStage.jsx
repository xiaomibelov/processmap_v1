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
