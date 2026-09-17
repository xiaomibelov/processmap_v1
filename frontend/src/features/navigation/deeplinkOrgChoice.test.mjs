// deeplinkOrgChoice — fix/session-deeplink-404.
// Диплинк /app?project=<id>&session=<id> не должен упираться в стену
// org-picker'а («Выберите организацию»): org резолвится из проекта ссылки
// (backend scoped-загрузка перебирает org-кандидаты пользователя) и, если
// пользователь — член этой org, выбор орга происходит автоматически.
// Чистая функция — тестируется без React (node --test).
//
// Запуск: node --test src/features/navigation/deeplinkOrgChoice.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  parseDeeplinkProjectId,
  resolveDeeplinkOrgChoice,
} from "./deeplinkOrgChoice.js";

test("parseDeeplinkProjectId: извлекает project из search", () => {
  assert.equal(parseDeeplinkProjectId("?project=abc123&session=s1"), "abc123");
  assert.equal(parseDeeplinkProjectId("?session=s1&project=def456"), "def456");
  assert.equal(parseDeeplinkProjectId(""), "");
  assert.equal(parseDeeplinkProjectId("?session=s1"), "");
  assert.equal(parseDeeplinkProjectId("?project=%20%20"), "");
});

test("resolve: project в org членства → picked с orgId", async () => {
  const apiGetProject = async (pid) => ({
    ok: true,
    project: { id: pid, org_id: "org_b" },
  });
  const result = await resolveDeeplinkOrgChoice({
    projectId: "p1",
    orgItems: [{ org_id: "org_a" }, { org_id: "org_b" }],
    apiGetProject,
  });
  assert.deepEqual(result, { status: "picked", orgId: "org_b" });
});

test("resolve: project не найден (404/сеть) → picker (стена сохраняется)", async () => {
  const result = await resolveDeeplinkOrgChoice({
    projectId: "missing",
    orgItems: [{ org_id: "org_a" }],
    apiGetProject: async () => ({ ok: false, status: 404 }),
  });
  assert.deepEqual(result, { status: "picker" });
});

test("resolve: project в org, где НЕТ membership → picker (чужой org)", async () => {
  const result = await resolveDeeplinkOrgChoice({
    projectId: "p1",
    orgItems: [{ org_id: "org_a" }],
    apiGetProject: async () => ({ ok: true, project: { org_id: "org_foreign" } }),
  });
  assert.deepEqual(result, { status: "picker" });
});

test("resolve: пустой org_id у проекта → picker", async () => {
  const result = await resolveDeeplinkOrgChoice({
    projectId: "p1",
    orgItems: [{ org_id: "org_a" }],
    apiGetProject: async () => ({ ok: true, project: {} }),
  });
  assert.deepEqual(result, { status: "picker" });
});

test("resolve: apiGetProject бросает → picker (не пробрасываем)", async () => {
  const result = await resolveDeeplinkOrgChoice({
    projectId: "p1",
    orgItems: [{ org_id: "org_a" }],
    apiGetProject: async () => {
      throw new Error("boom");
    },
  });
  assert.deepEqual(result, { status: "picker" });
});

test("resolve: orgItems без org_id не крашит", async () => {
  const result = await resolveDeeplinkOrgChoice({
    projectId: "p1",
    orgItems: [null, {}],
    apiGetProject: async () => ({ ok: true, project: { org_id: "org_a" } }),
  });
  assert.deepEqual(result, { status: "picker" });
});
