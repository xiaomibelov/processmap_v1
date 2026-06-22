import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

function seedCollapsedSubprocessXml(runId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_${runId}"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="Collapsed ${runId}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="SubProcess_1" name="Collapsed Source">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:startEvent id="SubStart_1">
        <bpmn:outgoing>SubFlow_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:task id="InnerTask_1" name="Inner task">
        <bpmn:incoming>SubFlow_1</bpmn:incoming>
        <bpmn:outgoing>SubFlow_2</bpmn:outgoing>
      </bpmn:task>
      <bpmn:endEvent id="SubEnd_1">
        <bpmn:incoming>SubFlow_2</bpmn:incoming>
      </bpmn:endEvent>
      <bpmn:sequenceFlow id="SubFlow_1" sourceRef="SubStart_1" targetRef="InnerTask_1" />
      <bpmn:sequenceFlow id="SubFlow_2" sourceRef="InnerTask_1" targetRef="SubEnd_1" />
    </bpmn:subProcess>
    <bpmn:task id="Task_1" name="Neighbor task">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="SubProcess_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="SubProcess_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_1_di" bpmnElement="SubProcess_1" isExpanded="false">
        <dc:Bounds x="260" y="128" width="180" height="110" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="540" y="143" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="178" />
        <di:waypoint x="260" y="183" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="440" y="183" />
        <di:waypoint x="540" y="183" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="SubProcess_1_diagram">
    <bpmndi:BPMNPlane id="SubProcess_1_plane" bpmnElement="SubProcess_1">
      <bpmndi:BPMNShape id="SubStart_1_di" bpmnElement="SubStart_1">
        <dc:Bounds x="120" y="120" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="InnerTask_1_di" bpmnElement="InnerTask_1">
        <dc:Bounds x="220" y="98" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubEnd_1_di" bpmnElement="SubEnd_1">
        <dc:Bounds x="440" y="120" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="SubFlow_1_di" bpmnElement="SubFlow_1">
        <di:waypoint x="156" y="138" />
        <di:waypoint x="220" y="138" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SubFlow_2_di" bpmnElement="SubFlow_2">
        <di:waypoint x="360" y="138" />
        <di:waypoint x="440" y="138" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function waitDiagramReady(page) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        if (!modeler) return { ok: false, error: "modeler_missing" };
        const registry = modeler.get("elementRegistry");
        const element = registry?.get?.("SubProcess_1");
        return {
          ok: !!element,
          type: String(element?.businessObject?.$type || element?.type || ""),
          collapsed: element?.collapsed === true,
        };
      });
    })
    .toMatchObject({ ok: true, type: "bpmn:SubProcess", collapsed: true });
}

async function getCurrentRootId(page) {
  return await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return "";
    const canvas = modeler.get("canvas");
    const root = canvas?.getRootElement?.();
    return String(root?.businessObject?.id || root?.id || "");
  });
}

async function apiSessionParent(request, sessionId, headers) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}`, { headers });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return body;
}

test("drilldown arrow navigates into subprocess and breadcrumb back returns to parent", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.headers, seedCollapsedSubprocessXml(runId));
  const testedUrl = `/app?project=${fixture.projectId}&session=${fixture.sessionId}`;

  page.on("pageerror", (error) => {
    console.error("[PAGEERROR]", error?.message || error);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[CONSOLE]", msg.text());
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.__FPC_DEBUG_NAV__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });

  await page.goto(testedUrl);
  try {
    await page.locator("h1:has-text('Выберите организацию')").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("button").filter({ has: page.locator("div", { hasText: "Default" }) }).first().click();
  } catch {
    // org chooser not shown
  }
  await expect.poll(async () => page.url()).toContain(`session=${encodeURIComponent(fixture.sessionId)}`);
  await waitDiagramReady(page);

  const drilldown = page.locator(".bjs-drilldown").first();
  await expect(drilldown, "drilldown arrow should be rendered").toBeVisible();

  await drilldown.click({ force: true });

  // Wait for navigation to child session.
  await expect.poll(async () => {
    const url = page.url();
    const match = url.match(/[?&]session=([^&]+)/);
    const currentSession = match ? decodeURIComponent(match[1]) : "";
    return currentSession && currentSession !== fixture.sessionId ? currentSession : "";
  }, { timeout: 15000 }).not.toBe("");

  const childSessionId = await page.evaluate(() => {
    const m = window.location.href.match(/[?&]session=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  });

  const breadcrumbs = page.getByTestId("subprocess-breadcrumbs");
  await expect(breadcrumbs).toBeVisible();
  await expect(breadcrumbs).toContainText("Подпроцесс");

  await waitForDiagramReady(page);
  await expect.poll(async () => await getCurrentRootId(page), { timeout: 15000 }).toBe("SubProcess_1");

  const childMeta = await apiSessionParent(request, childSessionId, auth.headers);
  expect(childMeta.parent_session_id || childMeta.parentSessionId).toBe(fixture.sessionId);

  // Click breadcrumb back button to return to parent.
  await page.getByTestId("subprocess-back-button").click();

  await expect.poll(async () => page.url()).not.toContain(`session=${encodeURIComponent(childSessionId)}`);
  await expect.poll(async () => page.url()).toContain(`session=${encodeURIComponent(fixture.sessionId)}`);

  await expect.poll(async () => getCurrentRootId(page), { timeout: 15000 }).toBe("Process_1");

  await expect(page.locator(".bjs-drilldown").first()).toBeVisible();
});

test("browser back button returns from subprocess to parent session", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.headers, seedCollapsedSubprocessXml(runId));

  page.on("pageerror", (error) => console.error("[PAGEERROR]", error?.message || error));
  page.on("console", (msg) => console.log(`[CONSOLE ${msg.type()}]`, msg.text()));

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });

  await page.goto(`/app?project=${fixture.projectId}&session=${fixture.sessionId}`);
  try {
    await page.locator("h1:has-text('Выберите организацию')").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("button").filter({ has: page.locator("div", { hasText: "Default" }) }).first().click();
  } catch {
    // org chooser not shown
  }
  await expect.poll(async () => page.url()).toContain(`session=${encodeURIComponent(fixture.sessionId)}`);
  await waitDiagramReady(page);

  const drilldown = page.locator(".bjs-drilldown").first();
  await expect(drilldown, "drilldown arrow should be rendered").toBeVisible();
  await drilldown.click({ force: true });

  await expect.poll(async () => {
    const url = page.url();
    const match = url.match(/[?&]session=([^&]+)/);
    const currentSession = match ? decodeURIComponent(match[1]) : "";
    return currentSession && currentSession !== fixture.sessionId ? currentSession : "";
  }, { timeout: 15000 }).not.toBe("");

  await waitForDiagramReady(page);
  await expect.poll(async () => getCurrentRootId(page), { timeout: 15000 }).toBe("SubProcess_1");

  const childSessionId = await page.evaluate(() => {
    const m = window.location.href.match(/[?&]session=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  });
  expect(childSessionId).not.toBe("");

  // eslint-disable-next-line no-console
  console.log("[E2E DEBUG] before goBack", await page.evaluate(() => ({ href: window.location.href, length: window.history.length, state: window.history.state })));

  // Use the browser back button (history back).
  await page.goBack();

  // eslint-disable-next-line no-console
  console.log("[E2E DEBUG] draft & root after goBack", await page.evaluate(() => ({
    href: window.location.href,
    draftSid: window.__FPC_E2E_DRAFT__?.session_id || "",
    rootId: (() => {
      const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      if (!modeler) return "";
      const canvas = modeler.get("canvas");
      const root = canvas?.getRootElement?.();
      return String(root?.businessObject?.id || root?.id || "");
    })(),
  })));

  // eslint-disable-next-line no-console
  console.log("[E2E DEBUG] after goBack", await page.evaluate(() => ({ href: window.location.href, length: window.history.length, state: window.history.state })));

  await expect.poll(async () => page.url()).toContain(`session=${encodeURIComponent(fixture.sessionId)}`);
  await expect.poll(async () => page.url()).not.toContain(`session=${encodeURIComponent(childSessionId)}`);
  await waitForDiagramReady(page);
  await expect.poll(async () => getCurrentRootId(page), { timeout: 15000 }).toBe("Process_1");
});
