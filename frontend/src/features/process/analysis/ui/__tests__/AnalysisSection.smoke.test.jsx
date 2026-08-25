// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { AnalysisSection } from "../index.js";

function setupContainer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return {
    container,
    cleanup() {
      container.remove();
    },
  };
}

describe("AnalysisSection smoke", () => {
  it("renders title, subtitle, actions and children", () => {
    const html = renderToString(
      <AnalysisSection
        title="Test title"
        subtitle="Test subtitle"
        actions={<button type="button">Action</button>}
        badge="badge"
      >
        <div>Child content</div>
      </AnalysisSection>
    );
    expect(html).toContain("Test title");
    expect(html).toContain("Test subtitle");
    expect(html).toContain("Action");
    expect(html).toContain("badge");
    expect(html).toContain("Child content");
    expect(html).toContain('data-testid="analysis-section"');
    expect(html).toContain('data-testid="analysis-section-title"');
  });

  it("collapses and expands on toggle", async () => {
    const onToggle = vi.fn();
    const { container, cleanup } = setupContainer();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AnalysisSection title="Collapsible" collapsible collapsed={false} onToggleCollapse={onToggle}>
          <div>Body</div>
        </AnalysisSection>
      );
    });

    expect(container.textContent).toContain("Body");
    const toggle = container.querySelector('[data-testid="analysis-section-toggle"]');
    expect(toggle).not.toBeNull();

    await act(async () => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onToggle).toHaveBeenCalledTimes(1);

    root.unmount();
    cleanup();
  });
});
