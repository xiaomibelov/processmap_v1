import { expect, test } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function seedBpmnXml(name = "E2E change element") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false" name="${name}">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Activity_1" name="Replace me" />
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="150" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="280" y="128" width="164" height="92" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="520" y="150" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function apiJson(res, opLabel) {
  const txt = await res.text();
  let body = {};
  try {
    body = txt ? JSON.parse(txt) : {};
  } catch {
    body = { raw: txt };
  }
  expect(res.ok(), `${opLabel}: ${txt}`).toBeTruthy();
  return body;
}

async function createFixture(request, runId) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    data: { title: `E2E replace project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E replace session ${runId}`,
        roles: ["Повар 1", "Повар 2"],
        start_role: "Повар 1",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    data: { xml: seedBpmnXml(`E2E replace ${runId}`) },
  });
  await apiJson(putRes, "put bpmn");
  return { projectId, sessionId };
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function openFixture(page, fixture) {
  await page.goto("/");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
  await switchTab(page, "Diagram");
}

test("Change Element сохраняет размеры и не теряет заметки узла", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await createFixture(request, runId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_leftpanel_hidden", "1");
  });
  await openFixture(page, fixture);

  await expect
    .poll(async () => await page.evaluate(() => !!window.__FPC_E2E_MODELER__))
    .toBeTruthy();
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__;
        if (!modeler) return false;
        const registry = modeler.get("elementRegistry");
        const shape = registry.get("Activity_1")
          || (registry.filter((el) => String(el?.type || "").endsWith("Task")) || [])[0];
        if (!shape) return false;
        const nums = [shape.x, shape.y, shape.width, shape.height].map((v) => Number(v));
        return nums.every(Number.isFinite) && nums[2] > 20 && nums[3] > 20;
      });
    })
    .toBeTruthy();

  const selected = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const eventBus = modeler.get("eventBus");
      const target = registry.get("Activity_1")
        || (registry.filter((el) => String(el?.type || "").endsWith("Task")) || [])[0];
      if (!target) return { ok: false, error: "target_missing" };
      eventBus.fire("element.click", { element: target });
      return {
        ok: true,
        id: String(target.id || ""),
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(selected.ok, JSON.stringify(selected)).toBeTruthy();

  const noteText = `replace-note-${runId}`;
  await page.fill('textarea[placeholder=\"Заметка для выбранного узла...\"]', noteText);
  const notePatchPromise = page.waitForResponse((res) => {
    return res.request().method() === "PATCH"
      && /\/api\/sessions\/[^/]+$/.test(new URL(res.url()).pathname);
  });
  await page.getByRole("button", { name: "Добавить заметку к узлу" }).click();
  const notePatchRes = await notePatchPromise;
  expect(notePatchRes.ok()).toBeTruthy();
  await expect(page.locator("#element-notes-section")).toContainText("заметок: 1");
  await expect(page.locator("#element-notes-section")).toContainText(noteText);

  const replaced = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const bpmnReplace = modeler.get("bpmnReplace");
      const eventBus = modeler.get("eventBus");
      const oldShape = registry.get("Activity_1")
        || (registry.filter((el) => String(el?.type || "").endsWith("Task")) || [])[0];
      if (!oldShape) return { ok: false, error: "old_shape_missing" };
      const oldCenter = {
        x: Number(oldShape.x || 0) + Number(oldShape.width || 0) / 2,
        y: Number(oldShape.y || 0) + Number(oldShape.height || 0) / 2,
      };
      const old = {
        id: String(oldShape.id || ""),
        type: String(oldShape.businessObject?.$type || oldShape.type || ""),
        x: Number(oldShape.x || 0),
        y: Number(oldShape.y || 0),
        width: Number(oldShape.width || 0),
        height: Number(oldShape.height || 0),
      };
      const newShape = bpmnReplace.replaceElement(oldShape, { type: "bpmn:ServiceTask" });
      const resolved = newShape
        || registry.get(old.id)
        || (registry.filter((el) => {
          if (!String(el?.businessObject?.$type || el?.type || "").endsWith("Task")) return false;
          const cx = Number(el.x || 0) + Number(el.width || 0) / 2;
          const cy = Number(el.y || 0) + Number(el.height || 0) / 2;
          return Math.abs(cx - oldCenter.x) < 2 && Math.abs(cy - oldCenter.y) < 2;
        }) || [])[0];
      if (!resolved) return { ok: false, error: "new_shape_missing", old };

      eventBus.fire("element.click", { element: resolved });
      return {
        ok: true,
        old,
        next: {
          id: String(resolved.id || ""),
          type: String(resolved.businessObject?.$type || resolved.type || ""),
          x: Number(resolved.x || 0),
          y: Number(resolved.y || 0),
          width: Number(resolved.width || 0),
          height: Number(resolved.height || 0),
        },
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(replaced.ok, JSON.stringify(replaced)).toBeTruthy();
  expect(String(replaced.next?.type || "")).toBe("bpmn:ServiceTask");

  await expect
    .poll(async () => {
      const probe = await page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__;
        if (!modeler) return { ok: false };
        const registry = modeler.get("elementRegistry");
        const shape = registry.get("Activity_1")
          || (registry.filter((el) => String(el?.businessObject?.$type || "").endsWith("Task")) || [])[0];
        if (!shape) return { ok: false };
        return {
          ok: true,
          x: Number(shape.x || 0),
          y: Number(shape.y || 0),
          width: Number(shape.width || 0),
          height: Number(shape.height || 0),
        };
      });
      if (!probe?.ok) return false;
      return (
        Math.abs(Number(probe.width || 0) - Number(replaced.old.width || 0)) <= 0.6
        && Math.abs(Number(probe.height || 0) - Number(replaced.old.height || 0)) <= 0.6
      );
    })
    .toBeTruthy();

  const changeTrace = await page.evaluate(() => {
    const arr = Array.isArray(window.__FPC_CHANGE_ELEMENT_LOG__) ? window.__FPC_CHANGE_ELEMENT_LOG__ : [];
    return arr.slice(-8);
  });
  const remapTrace = await page.evaluate(() => {
    const arr = Array.isArray(window.__FPC_NOTES_REMAP_LOG__) ? window.__FPC_NOTES_REMAP_LOG__ : [];
    return arr.slice(-8);
  });
  const postTrace = [...changeTrace].reverse().find((it) => String(it?.stage || "") === "post");
  const replacedId = String(postTrace?.newId || replaced.next?.id || "").trim();
  await expect
    .poll(async () => {
      return await page.evaluate(({ oldId, newId, text }) => {
        const d = window.__FPC_E2E_DRAFT__ || {};
        const map = d.notes_by_element || d.notesByElementId || {};
        const byOld = map?.[oldId];
        const byNew = map?.[newId];
        const oldItems = Array.isArray(byOld?.items) ? byOld.items : [];
        const newItems = Array.isArray(byNew?.items) ? byNew.items : [];
        const hasText = newItems.some((it) => String(it?.text || "").includes(String(text || "")));
        return !!newId && oldItems.length === 0 && newItems.length > 0 && hasText;
      }, {
        oldId: String(replaced.old?.id || ""),
        newId: replacedId,
        text: noteText,
      });
    }, `notes_missing_after_replace trace=${JSON.stringify({ changeTrace, remapTrace })}`)
    .toBeTruthy();

});
