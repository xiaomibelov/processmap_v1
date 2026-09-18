import test from "node:test";
import assert from "node:assert/strict";

import { buildSaveStatusSlotView } from "./saveStatusSlotModel.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step1 (UI.md §2): outbox-стадии индикатора
// сохранения. Стадии ops-saving / ops-rebase / ops-degraded подаются через
// opsStageRaw (или saveUploadStatusRaw.opsStage). Словарь view.state остаётся
// в зафиксированном контракте saving/dirty/saved/failed/stale/conflict —
// ops-стадии меняют label/title и публикуют opsStage для JSX.
// ---------------------------------------------------------------------------

test("ops-saving maps onto saving state with delta label", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: { state: "saving" },
    opsStageRaw: "ops-saving",
  });
  assert.equal(view.state, "saving");
  assert.equal(view.opsStage, "ops-saving");
  assert.match(view.label, /дельта|Сохранение/i);
});

test("ops-rebase maps onto saving state with rebase label", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: { state: "saving" },
    opsStageRaw: "ops-rebase",
  });
  assert.equal(view.state, "saving");
  assert.equal(view.opsStage, "ops-rebase");
  assert.match(view.label, /верси|синхрон/i);
});

test("ops-degraded maps onto failed state with degraded label", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: { state: "saved" },
    opsStageRaw: "ops-degraded",
  });
  assert.equal(view.state, "failed");
  assert.equal(view.opsStage, "ops-degraded");
  assert.match(view.label, /полн/i, "degraded label mentions full save fallback");
});

test("ops-degraded copy: fixed full-save wording with reassurance, reason only telemetry", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: {
      state: "saved",
      opsStage: "ops-degraded",
      opsReason: "full_save_required_for_bpmn_type",
    },
  });
  assert.equal(view.state, "failed");
  assert.equal(view.label, "Сохраняем полностью: быстрое сохранение недоступно для этих изменений.");
  assert.ok(view.title.includes("Данные не потеряны"), "title reassures data is not lost");
  assert.ok(view.title.includes("полное сохранение"), "title confirms full save is active");
  assert.ok(!view.title.includes("full_save_required_for_bpmn_type"), "no raw error details in visible copy");
  assert.equal(view.opsReason, "full_save_required_for_bpmn_type", "reason exposed only as telemetry field");
});

test("conflict still dominates ops stages (existing conflict UX untouched)", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: { state: "conflict" },
    opsStageRaw: "ops-rebase",
  });
  assert.equal(view.state, "conflict");
  assert.equal(view.opsStage, "ops-rebase", "ops stage still visible for diagnostics");
});

test("absent ops stage keeps legacy view untouched", () => {
  const view = buildSaveStatusSlotView({ saveUploadStatusRaw: { state: "saved" } });
  assert.equal(view.state, "saved");
  assert.equal(view.opsStage, "");
  assert.equal(view.label, "Сохранено");
});

test("opsStage read from saveUploadStatusRaw.opsStage as fallback", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: { state: "saving", opsStage: "ops-saving" },
  });
  assert.equal(view.opsStage, "ops-saving");
});
