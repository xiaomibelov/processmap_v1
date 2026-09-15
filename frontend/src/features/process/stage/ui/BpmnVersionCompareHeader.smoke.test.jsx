// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import BpmnVersionCompareHeader from "./BpmnVersionCompareHeader.jsx";

const DEFAULT_PROPS = {
  onModeChange: () => {},
  onTogglePositional: () => {},
};

describe("BpmnVersionCompareHeader smoke", () => {
  it("renders legend with counts for added/removed/changed", () => {
    const html = renderToString(
      <BpmnVersionCompareHeader
        {...DEFAULT_PROPS}
        counts={{ added: 2, removed: 1, changed: 3, moved: 0, resized: 0 }}
        mode="diagram"
      />,
    );
    expect(html).toContain("bpmn-versions-compare-legend");
    expect(html).toContain("bpmn-versions-legend-added");
    expect(html).toContain("bpmn-versions-legend-removed");
    expect(html).toContain("bpmn-versions-legend-changed");
    expect(html).toContain("добавлено");
    expect(html).toContain("удалено");
    expect(html).toContain("изменено");
    expect(html).not.toContain("bpmn-versions-legend-moved");
  });

  it("renders positional legend entries only when enabled", () => {
    const html = renderToString(
      <BpmnVersionCompareHeader
        {...DEFAULT_PROPS}
        counts={{ added: 0, removed: 0, changed: 0, moved: 4, resized: 2 }}
        mode="diagram"
        showPositional
      />,
    );
    expect(html).toContain("bpmn-versions-legend-moved");
    expect(html).toContain("bpmn-versions-legend-resized");
    expect(html).toContain("сдвинут");
    expect(html).toContain("изменён размер");
  });

  it("renders segmented diagram/xml mode toggle with aria-pressed", () => {
    const html = renderToString(
      <BpmnVersionCompareHeader {...DEFAULT_PROPS} counts={{ added: 1, removed: 0, changed: 0, moved: 0, resized: 0 }} mode="xml" />,
    );
    expect(html).toContain("bpmn-versions-mode-diagram");
    expect(html).toContain("bpmn-versions-mode-xml");
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain("Диаграмма");
    expect(html).toContain(">XML<");
  });

  it("renders positional checkbox and busy/no-changes states", () => {
    const busyHtml = renderToString(
      <BpmnVersionCompareHeader {...DEFAULT_PROPS} counts={null} mode="diagram" diffBusy />,
    );
    expect(busyHtml).toContain("bpmn-versions-diff-busy");
    expect(busyHtml).toContain("bpmn-versions-show-positional");
    const noChangesHtml = renderToString(
      <BpmnVersionCompareHeader
        {...DEFAULT_PROPS}
        counts={{ added: 0, removed: 0, changed: 0, moved: 0, resized: 0 }}
        mode="diagram"
        noChanges
      />,
    );
    expect(noChangesHtml).toContain("bpmn-versions-no-changes");
    expect(noChangesHtml).toContain("Изменений не найдено");
  });
});
