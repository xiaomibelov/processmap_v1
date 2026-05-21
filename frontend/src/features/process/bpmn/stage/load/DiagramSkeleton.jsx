import React from "react";

export default function DiagramSkeleton() {
  return (
    <div data-testid="diagram-skeleton" className="diagramSkeleton">
      <div className="diagramSkeleton-canvas">
        <div className="diagramSkeleton-pulse" />
      </div>
      <div className="diagramSkeleton-text">Загрузка диаграммы…</div>
    </div>
  );
}
