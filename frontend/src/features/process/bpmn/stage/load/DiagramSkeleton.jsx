import React from "react";
import FlowArcSpinner from "./FlowArcSpinner";
import "./DiagramSkeleton.css";

/**
 * FIX-V (блок 3): скелетон загрузки канваса большой схемы.
 * Placeholder-плашка «канваса» с shimmer-пульсом (transform/opacity — дёшево
 * для композитора), спиннер и видимая подпись. Тема — через токены,
 * reduced-motion учитывается в CSS.
 */
export default function DiagramSkeleton() {
  return (
    <div data-testid="diagram-skeleton" className="diagramSkeleton">
      <div className="diagramSkeleton-canvas">
        <div className="diagramSkeleton-pulse" />
        <div className="diagramSkeleton-node diagramSkeleton-node--a" />
        <div className="diagramSkeleton-node diagramSkeleton-node--b" />
        <div className="diagramSkeleton-node diagramSkeleton-node--c" />
      </div>
      <FlowArcSpinner />
      <div className="diagramSkeleton-caption" data-testid="diagram-skeleton-caption">
        Загружаем схему…
      </div>
    </div>
  );
}
