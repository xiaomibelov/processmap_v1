// Шаг «Токены» трека TOBE-UX: блок --pm-tobe-* в tokens.css (design-system/processmap-to-be/MASTER.md).
// Запуск: node --test src/styles/pm-tobe-tokens.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const tokensSource = fs.readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

test("tokens.css: блок --pm-tobe-* объявлен полностью (цвета MASTER.md)", () => {
  const expected = {
    "--pm-tobe-primary": "#1e3a5f",
    "--pm-tobe-on-primary": "#ffffff",
    "--pm-tobe-secondary": "#2563eb",
    "--pm-tobe-accent": "#059669",
    "--pm-tobe-bg": "#f8fafc",
    "--pm-tobe-fg": "#0f172a",
    "--pm-tobe-muted": "#f1f3f5",
    "--pm-tobe-muted-fg": "#64748b",
    "--pm-tobe-border": "#e4e7eb",
    "--pm-tobe-danger": "#dc2626",
    "--pm-tobe-warning": "#b45309",
    "--pm-tobe-step-pending": "#b8c6da",
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.ok(
      tokensSource.includes(`${name}: ${value};`),
      `${name}: ${value} не найден в tokens.css`,
    );
  }
});

test("tokens.css: типографика Fira с system-fallback (без внешнего @import — self-hosted)", () => {
  assert.match(tokensSource, /--pm-tobe-font-body: 'Fira Sans', system-ui/);
  assert.match(tokensSource, /--pm-tobe-font-mono: 'Fira Code', ui-monospace/);
  // решение шага «Токены»: внешний Google Fonts @import НЕ добавляем —
  // проект self-hosted, внешних рантайм-зависимостей в стилях нет (grep-факт);
  // Fira подхватится из локальной установки, иначе system fallback.
  assert.doesNotMatch(tokensSource, /@import url\('https:\/\/fonts\.googleapis\.com/);
});

test("tokens.css: существующие токены не тронуты (мост --ws-step-* откладывается на Z5-остаток)", () => {
  assert.match(tokensSource, /--ws-step-text: #9fb0c8;/);
  assert.match(tokensSource, /--ws-step-done: #7fce9b;/);
  assert.match(tokensSource, /--graph-canvas-trace-color: #7b5cff;/);
});

// контрастные пары, которые Z0 будет красить этими токенами (WCAG AA 4.5:1)
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(hexA, hexB) {
  const [la, lb] = [luminance(hexA), luminance(hexB)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

test("токены Z0-пар дают контраст ≥4.5:1 (расчёт WCAG)", () => {
  assert.ok(contrast("#0f172a", "#f8fafc") >= 4.5, "fg/bg");           // ~16.7:1
  assert.ok(contrast("#0f172a", "#ffffff") >= 4.5, "fg/white-card");   // findings в Z0
  assert.ok(contrast("#dc2626", "#ffffff") >= 4.5, "danger/white");    // error findings
  assert.ok(contrast("#b45309", "#ffffff") >= 4.5, "warning/white");   // warning findings
  assert.ok(contrast("#64748b", "#f8fafc") >= 4.5, "muted-fg/bg");     // вторичный текст
  assert.ok(contrast("#b8c6da", "#16202f") >= 4.5, "step-pending/bar");// pending-степпер в Z0
  assert.ok(contrast("#ffffff", "#1e3a5f") >= 4.5, "on-primary/primary");
});
