import React from "react";

function toText(value) {
  return String(value || "").trim();
}

/**
 * UXF addendum-3: сегмент-контрол «Схема | TO BE».
 * Перенесён из верхнего хедера во вторую строку (средний хедер, справа от
 * вкладки «Diagram (BPMN)») и в левую панель рабочего места TO BE, чтобы
 * переключатель оставался на виду в обоих режимах.
 *
 * modeSwitch: {
 *   mode: "schema" | "tobe",
 *   canEnterTobe: boolean,
 *   enterTobeTitle: string,
 *   onEnterTobe: () => void,
 *   onExitTobe: () => void,
 * }
 */
export default function ModeSwitchSegment({ modeSwitch = null, className = "" }) {
  if (!modeSwitch) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      role="group"
      aria-label="Режим экрана"
      data-testid="mode-switch"
    >
      <button
        type="button"
        className={`segBtn rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${modeSwitch.mode === "schema" ? "on bg-accent text-white" : "text-muted hover:bg-accentSoft hover:text-fg"}`}
        role="tab"
        aria-selected={modeSwitch.mode === "schema"}
        data-testid="mode-switch-schema"
        title={modeSwitch.mode === "tobe" ? "Вернуться к схеме (bpmn.io, версии, аналитика)" : "Режим редактора схемы"}
        onClick={() => { if (modeSwitch.mode === "tobe") modeSwitch.onExitTobe?.(); }}
      >
        Схема
      </button>
      <button
        type="button"
        className={`segBtn rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${modeSwitch.mode === "tobe" ? "on bg-accent text-white" : !modeSwitch.canEnterTobe ? "isDisabled text-muted" : "text-muted hover:bg-accentSoft hover:text-fg"}`}
        role="tab"
        aria-selected={modeSwitch.mode === "tobe"}
        data-testid="mode-switch-tobe"
        disabled={modeSwitch.mode !== "tobe" && !modeSwitch.canEnterTobe}
        title={toText(modeSwitch.enterTobeTitle) || "Открыть рабочее место TO BE"}
        onClick={() => { if (modeSwitch.mode !== "tobe") modeSwitch.onEnterTobe?.(); }}
      >
        TO BE
      </button>
    </span>
  );
}
