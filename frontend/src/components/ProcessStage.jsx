import { useRef, useState } from "react";
import BpmnStage from "./process/BpmnStage";
import CopilotOverlay from "./process/CopilotOverlay";

export default function ProcessStage({ sessionId, mode, locked, bpmnXml, onRequestBpmnReload }) {
  const bpmnRef = useRef(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [selectedEl, setSelectedEl] = useState(null);

  return (
    <div className="stage">
      <div className="stageHead">
        <div className="processTitle">Процесс</div>

        <div className="stageActions">
          <button className="iconBtn" onClick={() => bpmnRef.current?.zoomOut?.()} title="Отдалить">−</button>
          <button className="iconBtn" onClick={() => bpmnRef.current?.zoomIn?.()} title="Приблизить">+</button>
          <button className="iconBtn" onClick={() => bpmnRef.current?.fit?.()} title="Вписать">⤢</button>
          <button className="iconBtn" onClick={() => onRequestBpmnReload?.()} disabled={!sessionId} title="Обновить BPMN">↻</button>
          <button className={copilotOpen ? "iconBtn active" : "iconBtn"} onClick={() => setCopilotOpen(v => !v)} title="AI Copilot">AI</button>
        </div>
      </div>

      <div className="stageBody">
        <BpmnStage
          ref={bpmnRef}
          sessionId={sessionId}
          locked={locked}
          mode={mode}
          xml={bpmnXml}
          onElementClick={(el) => {
            setSelectedEl(el || null);
            setCopilotOpen(true);
          }}
        />

        <CopilotOverlay open={copilotOpen} onClose={() => setCopilotOpen(false)} selectedEl={selectedEl} />
      </div>
    </div>
  );
}
