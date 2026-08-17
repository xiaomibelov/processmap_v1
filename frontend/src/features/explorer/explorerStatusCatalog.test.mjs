import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPLORER_STATUS_CATALOG,
  EXPLORER_STATUS_ORDER,
  EXPLORER_STATUS_TONE_CLASSES,
  explorerStatusChangeReducer,
  getExplorerStatusEntry,
  getExplorerStatusOptions,
  isExplorerStatusEditable,
  mapFolderContextStatusToCatalog,
  mapProjectStatusToCatalog,
  mapCatalogStatusToProjectApi,
  mapSessionStatusToCatalog,
} from "./explorerStatusCatalog.js";

test("catalog covers owner palette: AS IS gray / TO BE orange / В работе blue / Готово green / Архив muted", () => {
  assert.equal(EXPLORER_STATUS_CATALOG.as_is.label, "AS IS");
  assert.equal(EXPLORER_STATUS_CATALOG.as_is.tone, "gray");
  assert.equal(EXPLORER_STATUS_CATALOG.to_be.label, "TO BE");
  assert.equal(EXPLORER_STATUS_CATALOG.to_be.tone, "orange");
  assert.equal(EXPLORER_STATUS_CATALOG.in_progress.label, "В работе");
  assert.equal(EXPLORER_STATUS_CATALOG.in_progress.tone, "blue");
  assert.equal(EXPLORER_STATUS_CATALOG.ready.label, "Готово");
  assert.equal(EXPLORER_STATUS_CATALOG.ready.tone, "green");
  assert.equal(EXPLORER_STATUS_CATALOG.archived.label, "Архив");
  assert.equal(EXPLORER_STATUS_CATALOG.archived.tone, "muted");
  // каждый tone имеет классы точки
  for (const entry of Object.values(EXPLORER_STATUS_CATALOG)) {
    assert.ok(EXPLORER_STATUS_TONE_CLASSES[entry.tone], `tone ${entry.tone}`);
  }
  // порядок стабилен и покрывает все записи
  assert.deepEqual([...EXPLORER_STATUS_ORDER].sort(), Object.keys(EXPLORER_STATUS_CATALOG).sort());
});

test("folder domain mapping: none → «—», as_is/to_be корректны, мусор → none", () => {
  assert.equal(mapFolderContextStatusToCatalog("as_is"), "as_is");
  assert.equal(mapFolderContextStatusToCatalog("to_be"), "to_be");
  assert.equal(mapFolderContextStatusToCatalog("none"), "none");
  assert.equal(mapFolderContextStatusToCatalog(""), "none");
  assert.equal(mapFolderContextStatusToCatalog("garbage"), "none");
  assert.equal(getExplorerStatusEntry("folder", "as_is").label, "AS IS");
});

test("session domain mapping: manual statuses + aliases + fallback draft", () => {
  assert.equal(mapSessionStatusToCatalog("in_progress"), "in_progress");
  assert.equal(mapSessionStatusToCatalog("in_work"), "in_progress"); // alias
  assert.equal(mapSessionStatusToCatalog("ready"), "ready");
  assert.equal(mapSessionStatusToCatalog("archived"), "archived");
  assert.equal(mapSessionStatusToCatalog(undefined), "draft");
  assert.equal(getExplorerStatusEntry("session", "ready").label, "Готово");
});

test("project domain mapping: active → Активен, пусто → «—», done/completed → Готово, archived → Архив", () => {
  assert.equal(mapProjectStatusToCatalog("active"), "active");
  assert.equal(mapProjectStatusToCatalog(""), "none");
  assert.equal(mapProjectStatusToCatalog("on_hold"), "on_hold");
  assert.equal(mapProjectStatusToCatalog("done"), "ready");
  assert.equal(mapProjectStatusToCatalog("completed"), "ready");
  assert.equal(mapProjectStatusToCatalog("archived"), "archived");
  assert.equal(mapProjectStatusToCatalog("unknown_freeform"), "none");
  assert.equal(getExplorerStatusEntry("project", "active").label, "Активен");
});

test("catalog status maps back to project API values", () => {
  assert.equal(mapCatalogStatusToProjectApi("active"), "active");
  assert.equal(mapCatalogStatusToProjectApi("on_hold"), "on_hold");
  assert.equal(mapCatalogStatusToProjectApi("ready"), "done");
  assert.equal(mapCatalogStatusToProjectApi("archived"), "archived");
});

test("editable options: folder полный набор; session по transition-матрице; project полный набор", () => {
  assert.deepEqual(
    getExplorerStatusOptions("folder", "none").map((o) => o.id),
    ["none", "as_is", "to_be"],
  );
  // draft может перейти только в draft/in_progress/archived
  assert.deepEqual(
    getExplorerStatusOptions("session", "draft").map((o) => o.id),
    ["draft", "in_progress", "archived"],
  );
  // in_progress — полный набор session-статусов
  assert.deepEqual(
    getExplorerStatusOptions("session", "in_progress").map((o) => o.id),
    ["draft", "in_progress", "review", "ready", "archived"],
  );
  assert.deepEqual(
    getExplorerStatusOptions("project", "active").map((o) => o.id),
    ["active", "on_hold", "ready", "archived"],
  );
  assert.equal(isExplorerStatusEditable("folder"), true);
  assert.equal(isExplorerStatusEditable("session"), true);
  assert.equal(isExplorerStatusEditable("project"), true);
});

test("optimistic reducer: select → pending сразу, success фиксирует, failure откатывает", () => {
  let s = explorerStatusChangeReducer({ current: "as_is", pending: "as_is", saving: false }, { type: "select", value: "to_be" });
  assert.deepEqual(s, { current: "as_is", pending: "to_be", saving: true }); // UI показывает to_be сразу

  const ok = explorerStatusChangeReducer(s, { type: "success", value: "to_be" });
  assert.deepEqual(ok, { current: "to_be", pending: "to_be", saving: false });

  const fail = explorerStatusChangeReducer(s, { type: "failure" });
  assert.deepEqual(fail, { current: "as_is", pending: "as_is", saving: false }); // откат

  // select того же значения — no-op
  const noop = explorerStatusChangeReducer({ current: "as_is" }, { type: "select", value: "as_is" });
  assert.equal(noop.saving, false);
});
