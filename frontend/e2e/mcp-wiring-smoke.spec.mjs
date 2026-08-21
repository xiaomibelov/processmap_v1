import { expect, test } from "@playwright/test";
import { fnv1aHex, hasDiMarkers, makeBigDiagramXmlOptional } from "./helpers/bpmnFixtures.mjs";

const MCP_URL = String(process.env.E2E_BPMN_MCP_URL || "").trim();

async function isMcpReachable(url, timeoutMs = 1200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(String(url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "big_bpmn_fixture",
        options: { seed: 20260221, pools: 1, lanes: 1, tasks: 1, edges: 1, annotations: 0 },
      }),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

test("optional MCP helper wiring smoke", async () => {
  test.skip(!MCP_URL, "MCP URL not set");
  const reachable = await isMcpReachable(MCP_URL);
  test.skip(!reachable, `MCP not reachable: ${MCP_URL}`);

  const result = await makeBigDiagramXmlOptional({
    seed: 20260221,
    pools: 1,
    lanes: 1,
    tasks: 2,
    edges: 1,
    annotations: 0,
  });
  const xml = String(result?.xml || "");
  const hasTask = /<(?:\w+:)?task\b/i.test(xml);

  // eslint-disable-next-line no-console
  console.log(
    `[MCP_SMOKE_SPEC] source=${String(result?.source || "")} len=${xml.length} hash=${fnv1aHex(xml)} `
    + `hasDI=${hasDiMarkers(xml) ? "true" : "false"} hasTask=${hasTask ? "true" : "false"}`,
  );

  expect(String(result?.source || "")).toBe("mcp");
  expect(xml.length).toBeGreaterThan(1000);
  expect(hasDiMarkers(xml)).toBeTruthy();
  expect(hasTask).toBeTruthy();
});

