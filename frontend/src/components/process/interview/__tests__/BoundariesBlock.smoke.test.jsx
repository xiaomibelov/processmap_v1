// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import BoundariesBlock from "../BoundariesBlock.jsx";

function setupContainer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, cleanup() { container.remove(); } };
}

const defaultProps = {
  boundariesComplete: false,
  uiPrefsDirty: false,
  uiPrefsSavedAt: null,
  saveUiPrefs: vi.fn(),
  collapsed: false,
  toggleBlock: vi.fn(),
  boundaries: {
    trigger: "",
    start_shop: "",
    intermediate_roles: "",
    finish_state: "",
    finish_shop: "",
  },
  patchBoundary: vi.fn(),
  boundaryLaneOptions: [
    { name: "lane1", label: "L1: Приёмка", idx: 1, color: "#60a5fa" },
    { name: "lane2", label: "L2: Упаковка", idx: 2, color: "#f87171" },
  ],
  boundaryLaneOptionsFiltered: [
    { name: "lane1", label: "L1: Приёмка", idx: 1, color: "#60a5fa" },
    { name: "lane2", label: "L2: Упаковка", idx: 2, color: "#f87171" },
  ],
  boundariesLaneFilter: "",
  setBoundariesLaneFilter: vi.fn(),
  setUiPrefsDirty: vi.fn(),
  intermediateRolesAuto: "",
  resetBoundaries: vi.fn(),
};

describe("BoundariesBlock smoke", () => {
  it("renders stepper with three nodes", () => {
    const html = renderToString(<BoundariesBlock {...defaultProps} />);
    expect(html).toContain('data-testid="boundaries-stepper"');
    expect(html).toContain('data-testid="boundaries-stepper-node-start"');
    expect(html).toContain('data-testid="boundaries-stepper-node-intermediate"');
    expect(html).toContain('data-testid="boundaries-stepper-node-finish"');
    expect(html).toContain("START");
    expect(html).toContain("INTERMEDIATE");
    expect(html).toContain("FINISH");
  });

  it("does not render old interviewBoundsCard class", () => {
    const html = renderToString(<BoundariesBlock {...defaultProps} />);
    expect(html).not.toContain("interviewBoundsCard");
  });

  it("calls save and reset handlers", async () => {
    const saveUiPrefs = vi.fn();
    const resetBoundaries = vi.fn();
    const { container, cleanup } = setupContainer();
    const root = createRoot(container);

    await act(async () => {
      root.render(<BoundariesBlock {...defaultProps} saveUiPrefs={saveUiPrefs} resetBoundaries={resetBoundaries} />);
    });

    const buttons = container.querySelectorAll("button");
    const saveBtn = Array.from(buttons).find((b) => b.textContent.includes("Сохранить"));
    const resetBtn = Array.from(buttons).find((b) => b.textContent.includes("Сбросить"));

    expect(saveBtn).not.toBeUndefined();
    expect(resetBtn).not.toBeUndefined();

    await act(async () => {
      saveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(saveUiPrefs).toHaveBeenCalledTimes(1);

    await act(async () => {
      resetBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(resetBoundaries).toHaveBeenCalledTimes(1);

    root.unmount();
    cleanup();
  });
});
