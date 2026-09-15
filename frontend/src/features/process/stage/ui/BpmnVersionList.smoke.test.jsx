// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import BpmnVersionList from "./BpmnVersionList.jsx";

function makeItem(overrides = {}) {
  return {
    id: "v1",
    revisionNumber: 1,
    rev: 1,
    ts: 1750000000000,
    authorLabel: "Иван Петров",
    reasonLabel: "Сохранение",
    isTechnicalRevision: false,
    hash: "abcd1234",
    len: 2048,
    ...overrides,
  };
}

const DEFAULT_PROPS = {
  onPreview: () => {},
  onAssign: () => {},
  onLoadMore: () => {},
  onRefresh: () => {},
  onToggleTechnical: () => {},
};

describe("BpmnVersionList smoke", () => {
  it("renders three version cards with latest badge", () => {
    const items = [
      makeItem({ id: "v3", revisionNumber: 3, ts: 1750000200000 }),
      makeItem({ id: "v2", revisionNumber: 2, ts: 1750000100000 }),
      makeItem({ id: "v1", revisionNumber: 1, ts: 1750000000000 }),
    ];
    const html = renderToString(<BpmnVersionList {...DEFAULT_PROPS} items={items} loadState="ready" />);
    expect(html).toContain("bpmn-version-item");
    expect(html).toContain("Версия 3");
    expect(html).toContain("последняя");
    expect(html).not.toContain("техническая");
    expect(html).toContain("abcd1234");
    expect(html).toContain("2.0 KB");
  });

  it("renders A/B assign chips on each card", () => {
    const items = [makeItem({ id: "v2", revisionNumber: 2 }), makeItem({ id: "v1", revisionNumber: 1 })];
    const html = renderToString(
      <BpmnVersionList {...DEFAULT_PROPS} items={items} loadState="ready" compareAId="v2" />,
    );
    expect(html).toContain("bpmn-version-assign-a");
    expect(html).toContain("bpmn-version-assign-b");
    expect(html).toContain("Назначить версию A");
  });

  it("renders technical version muted with reason label", () => {
    const items = [makeItem({ id: "t1", isTechnicalRevision: true, reasonLabel: "Автосохранение" })];
    const html = renderToString(<BpmnVersionList {...DEFAULT_PROPS} items={items} loadState="ready" />);
    expect(html).toContain("техническая");
    expect(html).toContain("Автосохранение");
    expect(html).toContain("opacity-75");
  });

  it("renders one-version hint surface and diff summary line", () => {
    const items = [makeItem({ id: "v1", diffSummary: "+1 −2 Δ3" })];
    const html = renderToString(
      <BpmnVersionList {...DEFAULT_PROPS} items={items} loadState="ready" getDiffSummary={(item) => item.diffSummary || null} />,
    );
    expect(html).toContain("bpmn-version-diff-summary");
    expect(html).toContain("+1 −2 Δ3");
  });

  it("renders empty state message", () => {
    const html = renderToString(
      <BpmnVersionList {...DEFAULT_PROPS} items={[]} loadState="empty" emptyMessage="Версий пока нет." />,
    );
    expect(html).toContain("bpmn-versions-empty");
    expect(html).toContain("Версий пока нет.");
  });

  it("renders admin technical toggle only for admins", () => {
    const items = [makeItem()];
    const adminHtml = renderToString(
      <BpmnVersionList {...DEFAULT_PROPS} items={items} loadState="ready" isAdmin includeTechnical />,
    );
    expect(adminHtml).toContain("bpmn-versions-show-technical");
    const userHtml = renderToString(<BpmnVersionList {...DEFAULT_PROPS} items={items} loadState="ready" />);
    expect(userHtml).not.toContain("bpmn-versions-show-technical");
  });

  it("renders loading and failed states", () => {
    const loadingHtml = renderToString(<BpmnVersionList {...DEFAULT_PROPS} items={[]} loadState="loading" />);
    expect(loadingHtml).toContain("bpmn-versions-loading");
    const failedHtml = renderToString(
      <BpmnVersionList {...DEFAULT_PROPS} items={[]} loadState="failed" loadError="сеть недоступна" />,
    );
    expect(failedHtml).toContain("bpmn-versions-error");
    expect(failedHtml).toContain("сеть недоступна");
    expect(failedHtml).toContain("bpmn-versions-retry");
  });

  it("renders load-more and all-loaded footer states", () => {
    const items = [makeItem()];
    const moreHtml = renderToString(
      <BpmnVersionList {...DEFAULT_PROPS} items={items} loadState="ready" hasMore loadingMore={false} />,
    );
    expect(moreHtml).toContain("bpmn-versions-load-more");
    expect(moreHtml).toContain("Загрузить ещё 10");
    const doneHtml = renderToString(<BpmnVersionList {...DEFAULT_PROPS} items={items} loadState="ready" hasMore={false} />);
    expect(doneHtml).toContain("Все версии загружены");
  });
});
