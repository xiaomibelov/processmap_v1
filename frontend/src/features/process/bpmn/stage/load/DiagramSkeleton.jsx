import React from "react";
import FlowArcSpinner from "./FlowArcSpinner";

export default function DiagramSkeleton() {
  return (
    <div data-testid="diagram-skeleton" className="diagramSkeleton">
      <div className="diagramSkeleton-canvas">
        <div className="diagramSkeleton-pulse" />
      </div>
      <FlowArcSpinner />
    </div>
  );
}
