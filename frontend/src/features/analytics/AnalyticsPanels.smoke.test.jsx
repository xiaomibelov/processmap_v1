// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import AnalyticsPage from "./AnalyticsPage.jsx";
import AnalyticsOverviewPanel from "./AnalyticsOverviewPanel.jsx";
import AnalyticsPropertiesPanel from "./AnalyticsPropertiesPanel.jsx";

describe("analytics panels import/render smoke", () => {
  it("renders AnalyticsPropertiesPanel without throwing", () => {
    const html = renderToString(<AnalyticsPropertiesPanel scope="workspace" scopeId="ws_test" />);
    expect(html.length).toBeGreaterThan(0);
  });

  it("renders AnalyticsOverviewPanel without throwing", () => {
    const html = renderToString(
      <AnalyticsOverviewPanel
        data={null}
        quality={null}
        recalcRows={[]}
        loading={false}
        error=""
        refreshing={false}
        onRefresh={() => {}}
        onRetry={() => {}}
        onNavigate={() => {}}
      />
    );
    expect(html.length).toBeGreaterThan(0);
  });

  it("renders AnalyticsPage without throwing", () => {
    const html = renderToString(
      <AnalyticsPage
        scope="workspace"
        scopeId="ws_test"
        module="overview"
        orgId="org_test"
        embedded
      />
    );
    expect(html.length).toBeGreaterThan(0);
  });
});
