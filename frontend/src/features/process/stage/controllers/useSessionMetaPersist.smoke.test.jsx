// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { useRef } from "react";
import useSessionMetaPersist from "./useSessionMetaPersist";

function TestHarness() {
  const hybridLayerPersistedMapRef = useRef({});
  const hybridV2PersistedDocRef = useRef(null);
  const drawioPersistedMetaRef = useRef(null);

  const result = useSessionMetaPersist({
    sid: "s-1",
    isLocal: true,
    draftBpmnMeta: {},
    getBaseDiagramStateVersion: () => undefined,
    rememberDiagramStateVersion: () => null,
    onSessionSync: () => {},
    setGenErr: () => {},
    shortErr: (m) => String(m),
    hybridLayerPersistedMapRef,
    hybridV2PersistedDocRef,
    drawioPersistedMetaRef,
    normalizeHybridLayerMap: (v) => v || {},
    serializeHybridLayerMap: (v) => JSON.stringify(v),
    normalizeHybridV2Doc: (v) => v || {},
    docToComparableJson: (v) => JSON.stringify(v),
    normalizeDrawioMeta: (v) => v || {},
    serializeDrawioMeta: (v) => JSON.stringify(v),
  });

  return <div data-testid="hook-result">{result ? "rendered" : "empty"}</div>;
}

describe("useSessionMetaPersist smoke", () => {
  it("renders without TDZ ReferenceError from hook dependency declarations", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<TestHarness />);
    });

    expect(container.textContent).toContain("rendered");

    root.unmount();
    container.remove();
  });
});
