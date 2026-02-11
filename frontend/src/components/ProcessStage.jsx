import { useRef } from "react";
import BpmnStage from "./process/BpmnStage";
import CopilotOverlay from "./process/CopilotOverlay";

export default function ProcessStage({ mode, sessionId }) {
  const isInterview = mode === "interview";
  const bpmnRef = useRef(null);

  return (
    <div className="panel processPanel">
      <div className="processHead">
        <div className="title">
          Процесс <span className="muted" style={{ fontWeight: 600 }}>(Workflow)</span>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => bpmnRef.current?.zoomOut()} disabled={!isInterview}>−</button>
        <button className="btn" onClick={() => bpmnRef.current?.zoomIn()} disabled={!isInterview}>+</button>
        <button className="btn" onClick={() => bpmnRef.current?.fit()} disabled={!isInterview}>Fit</button>
      </div>

      <div className="processCanvas">
        <BpmnStage ref={bpmnRef} sessionId={sessionId} enabled={isInterview} />
        {isInterview ? <CopilotOverlay /> : null}
      </div>
    </div>
  );
}
