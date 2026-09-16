import test from "node:test";
import assert from "node:assert/strict";

import { buildSaveStatusSlotView } from "./saveStatusSlotModel.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.6, UI.md §6): двух-
// состоянийный индикатор — ops-local «Сохранено локально» с sublabel
// «ожидает сеть» при offline; ack (journal drained) → обычное «Сохранено».
// Словарь state не расширяется (прецедент subprocessesSyncLabel).
// ---------------------------------------------------------------------------

test("ops-local: saved state with local-persist label", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: { state: "saved", opsStage: "ops-local" },
  });
  assert.equal(view.state, "saved", "state vocabulary unchanged");
  assert.equal(view.opsStage, "ops-local");
  assert.match(view.label, /Сохранено локально/);
  assert.equal(view.awaitingNetworkLabel, "", "no sublabel without offline signal");
});

test("ops-local + offline: sublabel «ожидает сеть»", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: { state: "saved", opsStage: "ops-local", opsOffline: true },
  });
  assert.equal(view.state, "saved");
  assert.match(view.label, /Сохранено локально/);
  assert.equal(view.awaitingNetworkLabel, "ожидает сеть");
});

test("ops-saved: ack clears the local state back to plain Сохранено", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: { state: "saved", opsStage: "ops-saved" },
  });
  assert.equal(view.state, "saved");
  assert.equal(view.label, "Сохранено");
  assert.equal(view.awaitingNetworkLabel, "");
});

test("conflict still dominates ops-local (existing conflict UX untouched)", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: { state: "conflict", opsStage: "ops-local", opsOffline: true },
  });
  assert.equal(view.state, "conflict");
  assert.equal(view.awaitingNetworkLabel, "");
});

test("ops-saving while offline shows awaiting-network sublabel too", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: { state: "saving", opsStage: "ops-saving", opsOffline: true },
  });
  assert.equal(view.state, "saving");
  assert.equal(view.awaitingNetworkLabel, "ожидает сеть");
});
