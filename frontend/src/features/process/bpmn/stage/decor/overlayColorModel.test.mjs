import assert from "node:assert/strict";
import test from "node:test";

import {
  COLOR_FAMILIES,
  overlayPropertyColorByKey,
  overlayPropertyColorPlanForItems,
} from "./overlayColorModel.js";

function hexToRgb(hexRaw) {
  const hex = String(hexRaw || "").replace("#", "");
  if (hex.length !== 6) return [0, 0, 0];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function rgbDistance(leftRaw, rightRaw) {
  const left = hexToRgb(leftRaw);
  const right = hexToRgb(rightRaw);
  const dr = left[0] - right[0];
  const dg = left[1] - right[1];
  const db = left[2] - right[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

test("overlay color mapping remains deterministic per key", () => {
  const first = overlayPropertyColorByKey("container");
  const second = overlayPropertyColorByKey("container");
  assert.deepEqual(first, second);
  assert.equal(first.familyId, "cocoa");
});

test("container token variants resolve to cocoa family via curated mapping", () => {
  const keys = ["container_type", "container.count", "ContainerType", "контейнер_тип", "tray_id"];
  keys.forEach((key) => {
    const color = overlayPropertyColorByKey(key);
    assert.equal(color.familyId, "cocoa", `key=${key} family=${color.familyId}`);
  });
});

test("tara base key keeps dedicated lime family and stays distinct from container", () => {
  const tara = overlayPropertyColorByKey("tara");
  const container = overlayPropertyColorByKey("container_type");
  assert.equal(tara.familyId, "lime");
  assert.equal(container.familyId, "cocoa");
  assert.notEqual(tara.familyId, container.familyId);
});

test("overlay planner keeps stable family identity for repeated semantic keys", () => {
  const plan = overlayPropertyColorPlanForItems([
    { key: "tara", label: "tara", value: "A" },
    { key: "container", label: "container", value: "B" },
    { key: "tara", label: "tara", value: "C" },
  ]);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].familyId, plan[2].familyId);
  assert.notEqual(plan[0].familyId, plan[1].familyId);
  assert.equal(plan[0].toneId, "muted");
  assert.equal(plan[1].toneId, "muted");
  assert.equal(plan[2].toneId, "muted");
});

test("visually close families (tara vs container) keep stronger palette separation", () => {
  const tara = overlayPropertyColorByKey("tara");
  const container = overlayPropertyColorByKey("container");
  assert.notEqual(tara.familyId, container.familyId);

  const accentDistance = rgbDistance(tara.accent, container.accent);
  const backgroundDistance = rgbDistance(tara.background, container.background);
  assert.ok(accentDistance >= 44, `accentDistance=${accentDistance}`);
  assert.ok(backgroundDistance >= 20, `backgroundDistance=${backgroundDistance}`);
});

test("palette families remain unique and usable for dense clusters", () => {
  const ids = COLOR_FAMILIES.map((entry) => String(entry?.id || ""));
  assert.equal(new Set(ids).size, COLOR_FAMILIES.length);
  const mutedAccents = COLOR_FAMILIES.map((entry) => String(entry?.muted?.accent || ""));
  assert.equal(new Set(mutedAccents).size, COLOR_FAMILIES.length);
});

test("same property keeps the exact same color regardless of surrounding cluster", () => {
  const firstPlan = overlayPropertyColorPlanForItems([
    { key: "container_type", label: "container_type", value: "Противень" },
    { key: "tara", label: "tara", value: "Шпилька" },
  ]);
  const secondPlan = overlayPropertyColorPlanForItems([
    { key: "priority", label: "priority", value: "high" },
    { key: "container_type", label: "container_type", value: "Лоток" },
    { key: "temperature", label: "temperature", value: "65" },
    { key: "tara", label: "tara", value: "Шпилька" },
  ]);

  const firstContainer = firstPlan.find((entry) => entry.key === "container_type");
  const secondContainer = secondPlan.find((entry) => entry.key === "container_type");
  assert.ok(firstContainer);
  assert.ok(secondContainer);
  assert.equal(firstContainer.familyId, secondContainer.familyId);
  assert.equal(firstContainer.toneId, secondContainer.toneId);
  assert.equal(firstContainer.accent, secondContainer.accent);
  assert.equal(firstContainer.background, secondContainer.background);
  assert.equal(firstContainer.border, secondContainer.border);
  assert.equal(firstContainer.text, secondContainer.text);
});
