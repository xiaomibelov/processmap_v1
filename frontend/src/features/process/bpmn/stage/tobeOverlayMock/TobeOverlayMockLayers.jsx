import "./tobeOverlayMock.css";

// Слои mock-режима TO BE overlay внутри .bpmnStack (BpmnStage).
// AS IS ghost — ниже по z-order (первый в DOM), инертен (pointer-events:none,
// стилистика ghost в tobeOverlayMock.css); TO BE — активный слой поверх.
// Классы с префиксом mock*, существующие .bpmnLayer--diagram/--editor
// не переиспользуются (изоляция от существующих стилей).
export default function TobeOverlayMockLayers({ active, ghostVisible = true, asisRef, tobeRef }) {
  if (!active) return null;
  return (
    <>
      <div
        className="bpmnLayer bpmnLayer--mockAsis"
        data-testid="bpmn-layer-mock-asis"
        style={{ position: "absolute", inset: 0, display: ghostVisible ? "block" : "none" }}
      >
        <div className="bpmnCanvas" ref={asisRef} style={{ width: "100%", height: "100%" }} />
      </div>
      <div
        className="bpmnLayer bpmnLayer--mockTobe"
        data-testid="bpmn-layer-mock-tobe"
        style={{ position: "absolute", inset: 0 }}
      >
        <div className="bpmnCanvas" ref={tobeRef} style={{ width: "100%", height: "100%" }} />
      </div>
    </>
  );
}
