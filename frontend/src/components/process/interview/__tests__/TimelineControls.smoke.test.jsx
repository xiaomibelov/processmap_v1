// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import TimelineControls from "../TimelineControls.jsx";

function setupContainer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, cleanup() { container.remove(); } };
}

const defaultProps = {
  quickStepDraft: "",
  setQuickStepDraft: vi.fn(),
  addQuickStepFromInput: vi.fn(),
  addStep: vi.fn(),
  subprocessDraft: "",
  setSubprocessDraft: vi.fn(),
  addSubprocessLabel: vi.fn(),
  filteredTimelineCount: 0,
  timelineCount: 0,
  isTimelineFiltering: false,
  resetTimelineFilters: vi.fn(),
  saveUiPrefs: vi.fn(),
  uiPrefsSavedAt: null,
  uiPrefsDirty: false,
  showTimelineColsMenu: false,
  setShowTimelineColsMenu: vi.fn(),
  resetTimelineColumns: vi.fn(),
  hiddenTimelineCols: {},
  toggleTimelineColumn: vi.fn(),
  timelineFilters: {
    query: "",
    lane: "all",
    lanes: [],
    type: "all",
    subprocess: "all",
    bind: "all",
    annotation: "all",
    ai: "all",
    tiers: ["P0", "P1", "P2", "None"],
  },
  patchTimelineFilter: vi.fn(),
  timelineLaneOptions: [],
  timelineSubprocessOptions: [],
  selectedStepCount: 0,
  onGroupSelectedSteps: vi.fn(),
  orderMode: "bpmn",
  graphOrderLocked: true,
  bpmnOrderFallback: false,
  bpmnOrderHint: "",
  onSetOrderMode: vi.fn(),
  onOpenBindingAssistant: vi.fn(),
  bindingIssueCount: 0,
  statusCounts: {},
  dodSnapshot: {},
  timelineViewMode: "matrix",
  onSetTimelineViewMode: vi.fn(),
  branchViewMode: "tree",
  onSetBranchViewMode: vi.fn(),
  onToggleCollapse: vi.fn(),
  devDebugEnabled: false,
  onToggleDebug: vi.fn(),
};

describe("TimelineControls smoke", () => {
  it("renders primary toolbar row with required controls", () => {
    const html = renderToString(<TimelineControls {...defaultProps} />);
    expect(html).toContain('data-testid="steps-tab-toolbar"');
    expect(html).toContain('data-testid="interview-add-step-primary"');
    expect(html).toContain('data-testid="interview-advanced-toggle"');
    expect(html).toContain('data-testid="interview-view-mode-matrix-btn"');
    expect(html).toContain('data-testid="interview-view-mode-paths-btn"');
    expect(html).toContain('data-testid="interview-view-mode-diagram-btn"');
    expect(html).toContain('data-testid="binding-assistant-open"');
    expect(html).toContain('data-testid="interview-step-more-btn"');
    expect(html).toContain('data-testid="interview-quick-input-toggle"');
  });

  it("opens filters panel and switches view mode", async () => {
    const onSetViewMode = vi.fn();
    const { container, cleanup } = setupContainer();
    const root = createRoot(container);

    await act(async () => {
      root.render(<TimelineControls {...defaultProps} onSetTimelineViewMode={onSetViewMode} />);
    });

    const advancedToggle = container.querySelector('[data-testid="interview-advanced-toggle"]');
    expect(advancedToggle).not.toBeNull();

    await act(async () => {
      advancedToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="interview-advanced-controls"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="interview-order-select"]')).not.toBeNull();

    const pathsBtn = container.querySelector('[data-testid="interview-view-mode-paths-btn"]');
    await act(async () => {
      pathsBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSetViewMode).toHaveBeenCalledWith("paths");

    root.unmount();
    cleanup();
  });

  it("toggles quick input", async () => {
    const { container, cleanup } = setupContainer();
    const root = createRoot(container);

    await act(async () => {
      root.render(<TimelineControls {...defaultProps} />);
    });

    const quickToggle = container.querySelector('[data-testid="interview-quick-input-toggle"]');
    expect(quickToggle).not.toBeNull();

    await act(async () => {
      quickToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="interview-quick-step-input"]')).not.toBeNull();

    root.unmount();
    cleanup();
  });
});
