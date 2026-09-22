import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

// Дефект #1 контура feature/canvas-telemetry-feed (e2e: пустой экран на всех
// роутах): adminNav.js обращался ADMIN_ROUTE_META.canvasTelemetry.path, но
// ключ META вычисляемый — [ADMIN_SECTIONS.canvasTelemetry] = "canvas-telemetry".
// Прямого свойства нет → undefined.path на импорте → краш всего бандла.
// Цепочка импортов репо extensionless (vite-стиль), поэтому модуль
// недоступен для runtime-импорта в node --test — регрессионная проверка
// честно делается по исходнику (root cause подтверждён диагностикой:
// TypeError at adminNav.js:10:117 на vite dev-сервере).

const navSrc = readFileSync(new URL("../adminNav.js", import.meta.url), "utf8");
const metaSrc = readFileSync(new URL("../adminRoutes.constants.js", import.meta.url), "utf8");
const sectionsSrc = readFileSync(new URL("../adminRoutes.constants.js", import.meta.url), "utf8");

test("нет прямых обращений ADMIN_ROUTE_META.<prop> к несуществующим ключам", () => {
  // Ключи META — вычисляемые ([ADMIN_SECTIONS.x]). Прямое обращение допустимо
  // только когда имя свойства совпадает со значением секции.
  const directAccesses = [...navSrc.matchAll(/ADMIN_ROUTE_META\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  assert.ok(directAccesses.length > 0, "ожидались прямые обращения ADMIN_ROUTE_META.*");
  const declaredSections = [...sectionsSrc.matchAll(/^\s{2}([A-Za-z_$][\w$]*):\s*"([^"]+)"/gm)]
    .filter((m) => m[1] !== "path" && m[1] !== "title" && m[1] !== "subtitle");
  const sameNameKeys = new Set(declaredSections.filter((m) => m[1] === m[2]).map((m) => m[1]));
  for (const key of directAccesses) {
    assert.ok(
      sameNameKeys.has(key),
      `ADMIN_ROUTE_META.${key} — прямого свойства нет (ключ вычисляемый); используйте ADMIN_ROUTE_META[ADMIN_SECTIONS.${key}]`,
    );
  }
});

test("парность: каждая секция ADMIN_SECTIONS имеет META с path", () => {
  const sectionPairs = [...sectionsSrc.matchAll(/^\s{2}([A-Za-z_$][\w$]*):\s*"([^"]+)"/gm)]
    .filter((m) => m[1] !== "path" && m[1] !== "title" && m[1] !== "subtitle");
  const metaBlock = metaSrc.slice(metaSrc.indexOf("export const ADMIN_ROUTE_META"));
  for (const [, prop, section] of sectionPairs) {
    assert.ok(
      metaBlock.includes(`[ADMIN_SECTIONS.${prop}]`),
      `секция ${prop} ("${section}") не имеет записи в ADMIN_ROUTE_META`,
    );
  }
  const metaEntries = [...metaBlock.matchAll(/\[ADMIN_SECTIONS\.([A-Za-z_$][\w$]*)\]\s*:\s*\{/g)].map((m) => m[1]);
  for (const entry of metaEntries) {
    const pair = sectionPairs.find(([, prop]) => prop === entry);
    assert.ok(pair, `ADMIN_ROUTE_META[ADMIN_SECTIONS.${entry}] без объявления секции`);
    const blockRe = new RegExp(`\\[ADMIN_SECTIONS\\.${entry}\\]:\\s*\\{[^}]*path:\\s*"[^"]+"`);
    assert.ok(blockRe.test(metaBlock), `ADMIN_ROUTE_META[${entry}] без path`);
  }
});
