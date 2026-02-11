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
