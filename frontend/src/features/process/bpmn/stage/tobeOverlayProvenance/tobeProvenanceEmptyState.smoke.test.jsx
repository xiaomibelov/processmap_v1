// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { setLocale, t } from "../../../../../shared/i18n/index.js";
import {
  loadProvenanceForSession,
  resetProvenanceSessionState,
} from "./tobeOverlayProvenanceStore.js";
import {
  dismissProvenanceEmptyHint,
  noteProvenanceSelectionSeen,
  resetProvenanceEmptyHint,
} from "./tobeProvenanceEmptyState.js";
import { resetTobeOverlayUnderlayState, setTobeOverlayUnderlayActive } from "../tobeOverlayUnderlay/tobeOverlayUnderlayStore.js";

// T11: empty-state hint — когда provenance-store status === "empty" (TO BE
// собрана вручную/до трассировки) и подложка активна: первая попытка
// selection показывает одноразовую подсказку (объясняет ПОЧЕМУ связи нет).
// Once per session, dismissible; флаг сбрасывается при смене сессии.
const EMPTY_FETCH = {
  fetchXml: async () => ({ ok: true, status: 200, xml: "" }),
  fetchMeta: async () => ({ ok: true, status: 200, provenance: null }),
};

async function renderControls(props) {
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react-dom/test-utils");
  const { default: TobeOverlayUnderlayControls } = await import("../tobeOverlayUnderlay/TobeOverlayUnderlayControls.jsx");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TobeOverlayUnderlayControls {...props} />);
  });
  return { container, root, act };
}

describe("TobeOverlayUnderlayControls provenance empty-state (T11)", () => {
  beforeEach(async () => {
    setLocale("ru");
    resetTobeOverlayUnderlayState();
    resetProvenanceSessionState();
    resetProvenanceEmptyHint();
    setTobeOverlayUnderlayActive(true);
    await loadProvenanceForSession({ sessionId: "s-empty", ...EMPTY_FETCH });
  });

  it("status empty: до первого selection hint скрыт", async () => {
    const { container, root, act } = await renderControls({ underlayAsisSid: "asis-1" });
    try {
      expect(container.querySelector('[data-testid="tobe-prov-empty-hint"]')).toBeNull();
    } finally {
      await act(async () => { root.unmount(); });
      container.remove();
    }
  });

  it("первый selection при empty → hint показан 1 раз; повторный — без дубля", async () => {
    const { container, root, act } = await renderControls({ underlayAsisSid: "asis-1" });
    try {
      await act(async () => { noteProvenanceSelectionSeen(); });
      const hint = container.querySelector('[data-testid="tobe-prov-empty-hint"]');
      expect(hint).toBeTruthy();
      expect(container.querySelectorAll('[data-testid="tobe-prov-empty-hint"]').length).toBe(1);
      expect(hint.textContent).toContain(t("tobeUnderlay.provenance.empty"));

      await act(async () => { noteProvenanceSelectionSeen(); });
      expect(container.querySelectorAll('[data-testid="tobe-prov-empty-hint"]').length).toBe(1);
    } finally {
      await act(async () => { root.unmount(); });
      container.remove();
    }
  });

  it("dismiss (кнопка «Понятно»): hint скрыт", async () => {
    const { container, root, act } = await renderControls({ underlayAsisSid: "asis-1" });
    try {
      await act(async () => { noteProvenanceSelectionSeen(); });
      const dismissBtn = container.querySelector('[data-testid="tobe-prov-empty-dismiss"]');
      expect(dismissBtn).toBeTruthy();
      expect(dismissBtn.textContent).toBe(t("tobeUnderlay.provenance.dismiss"));
      await act(async () => {
        dismissBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(container.querySelector('[data-testid="tobe-prov-empty-hint"]')).toBeNull();
    } finally {
      await act(async () => { root.unmount(); });
      container.remove();
    }
  });

  it("смена сессии (resetProvenanceEmptyHint): флаг сброшен — hint снова может показаться", async () => {
    const { container, root, act } = await renderControls({ underlayAsisSid: "asis-1" });
    try {
      await act(async () => { noteProvenanceSelectionSeen(); });
      expect(container.querySelector('[data-testid="tobe-prov-empty-hint"]')).toBeTruthy();
      // teardown сессии: сброс store + флага, затем новая сессия тоже empty.
      await act(async () => {
        resetProvenanceSessionState();
        resetProvenanceEmptyHint();
      });
      await loadProvenanceForSession({ sessionId: "s-empty-2", ...EMPTY_FETCH });
      expect(container.querySelector('[data-testid="tobe-prov-empty-hint"]')).toBeNull();
      await act(async () => { noteProvenanceSelectionSeen(); });
      expect(container.querySelector('[data-testid="tobe-prov-empty-hint"]')).toBeTruthy();
    } finally {
      await act(async () => { root.unmount(); });
      container.remove();
    }
  });

  it("status ready (индекс есть): hint не показывается даже после selection", async () => {
    resetProvenanceSessionState();
    resetProvenanceEmptyHint();
    // XML с pm:Trace → ready (канал 1, без sidecar).
    const { embedProvenanceIntoBpmnXml } = await import("../../../../technologist/workspace/tobeProvenance.js");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P1" isExecutable="false"><bpmn:task id="Task_a" /></bpmn:process>
</bpmn:definitions>`;
    const embedded = await embedProvenanceIntoBpmnXml(xml, [
      { element_id: "AsIs_1", draft_node_ids: ["Task_a"], fate: "transformed_to", rule_id: "R01" },
    ]);
    await loadProvenanceForSession({
      sessionId: "s-ready",
      fetchXml: async () => ({ ok: true, status: 200, xml: embedded }),
      fetchMeta: async () => ({ ok: true, status: 200, provenance: null }),
    });
    const { container, root, act } = await renderControls({ underlayAsisSid: "asis-1" });
    try {
      await act(async () => { noteProvenanceSelectionSeen(); });
      expect(container.querySelector('[data-testid="tobe-prov-empty-hint"]')).toBeNull();
    } finally {
      await act(async () => { root.unmount(); });
      container.remove();
    }
  });
});
