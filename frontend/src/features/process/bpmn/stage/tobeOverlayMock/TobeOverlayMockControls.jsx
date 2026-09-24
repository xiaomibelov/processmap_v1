import {
  setTobeOverlayMockActive,
  setTobeOverlayMockGhostVisible,
} from "./mockOverlayModeStore.js";
import { useTobeOverlayMockActive, useTobeOverlayMockGhostVisible } from "./useTobeOverlayMock.js";

// Временные контролы mock-режима TO BE overlay. Живут в ProcessStageHeader
// (НЕ поверх канваса — user rejection), видимы только при флаге
// tobe_overlay_mock. Состояние — в mockOverlayModeStore (без persist).
export default function TobeOverlayMockControls() {
  const active = useTobeOverlayMockActive();
  const ghostVisible = useTobeOverlayMockGhostVisible();

  if (!active) {
    return (
      <button
        type="button"
        className="secondaryBtn h-8 px-2 text-xs"
        onClick={() => setTobeOverlayMockActive(true)}
        title="Включить временный mock-режим TO BE overlay"
        data-testid="tobe-overlay-mock-enter"
      >
        TO BE мок
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="secondaryBtn h-8 px-2 text-xs"
        onClick={() => setTobeOverlayMockGhostVisible(!ghostVisible)}
        title="Показать/скрыть AS IS-подложку"
        data-testid="tobe-overlay-mock-ghost-toggle"
      >
        AS IS-подложка{ghostVisible ? "" : " (скрыта)"}
      </button>
      <button
        type="button"
        className="secondaryBtn h-8 px-2 text-xs"
        onClick={() => setTobeOverlayMockActive(false)}
        title="Выйти из mock-режима TO BE overlay"
        data-testid="tobe-overlay-mock-exit"
      >
        Выйти из мока
      </button>
    </>
  );
}
