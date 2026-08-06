// Z0 TOBE-UX: контраст-guard — три точки красятся токенами --pm-tobe-*, opacity-гашение удалено.
// Запуск: node --test src/styles/pm-tobe-z0-contrast.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const ctor = read("../features/technologist/constructor/Constructor.css");
const wfbar = read("../features/technologist/workflow/WorkflowBar.css");
const ws = read("../features/technologist/workspace/Workspace.css");
const tokens = read("./tokens.css");

// WCAG-расчёт для проверки пар
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test("Z0-1: текст карточек замечаний — токен --pm-tobe-fg (было #EBF0F9 на белом 1.14:1)", () => {
  assert.match(ctor, /\.ctor-check__finding \{[\s\S]*?color: var\(--pm-tobe-fg, #0f172a\);/);
  assert.match(ctor, /\.ctor-check__finding--error \{\s*border-left: 3px solid var\(--pm-tobe-danger, #dc2626\);/);
  assert.match(ctor, /\.ctor-check__finding--warning \{\s*border-left: 3px solid var\(--pm-tobe-warning, #b45309\);/);
  assert.doesNotMatch(ctor, /#b9770e;/, "старый warning 3.9:1 не должен остаться как значение");
  // warning/error сводка и бейджи — тоже токенами
  assert.match(ctor, /\.ctor-check__summary-warnings \{\s*color: var\(--pm-tobe-warning/);
  assert.match(ctor, /\.ctor-check__summary-errors \{\s*color: var\(--pm-tobe-danger/);
  assert.match(ctor, /\.ctor-check__badge--warning \{\s*background: #fdf2dc;\s*color: var\(--pm-tobe-warning/);
  assert.match(ctor, /\.ctor-check__badge--blocked \{\s*background: #fbe3e3;\s*color: var\(--pm-tobe-danger/);
  assert.ok(contrast("#0f172a", "#ffffff") >= 4.5);
  assert.ok(contrast("#dc2626", "#ffffff") >= 4.5);
  assert.ok(contrast("#b45309", "#ffffff") >= 4.5);
});

test("Z0-2: pending/na степпера — solid-токены, opacity-гашение убрано в обоих дублях", () => {
  for (const [name, src, item, num] of [
    ["wfbar", wfbar, ".wfbar__step", ".wfbar__num"],
    ["tobeSteps", ws, ".tobeSteps__item", ".tobeSteps__num"],
  ]) {
    assert.match(src, new RegExp(`${item.replace(/\./g, "\\.")}--pending \\{ color: var\\(--pm-tobe-step-pending, #b8c6da\\); \\}`), `${name} pending`);
    assert.match(src, new RegExp(`${item.replace(/\./g, "\\.")}--na \\{ color: var\\(--pm-tobe-step-na, #8496ad\\); \\}`), `${name} na`);
    assert.doesNotMatch(src, new RegExp(`${item.replace(/\./g, "\\.")}--pending \\{ opacity`), `${name} pending без opacity`);
    assert.doesNotMatch(src, new RegExp(`${item.replace(/\./g, "\\.")}--na \\{ opacity`), `${name} na без opacity`);
  }
  assert.match(tokens, /--pm-tobe-step-na: #8496ad;/);
  assert.match(tokens, /--pm-tobe-disabled-fg: #55627a;/);
  assert.ok(contrast("#b8c6da", "#16202f") >= 4.5, "pending на баре");
  assert.ok(contrast("#8496ad", "#16202f") >= 4.5, "na на баре");
});

test("Z0-3: disabled кнопок/табов — muted-токены без opacity, блок после модификаторов", () => {
  assert.match(ctor, /\.ctor-btn:disabled,\s*\.ctor-btn--primary:disabled,\s*\.ctor-btn--danger:disabled,\s*\.ctor-btn--active:disabled \{\s*opacity: 1;/);
  assert.match(ctor, /\.ctor-btn:disabled,[\s\S]*?color: var\(--pm-tobe-disabled-fg, #55627a\);/);
  assert.match(ctor, /\.ctor-tab:disabled \{\s*opacity: 1;\s*background: var\(--pm-tobe-muted, #f1f3f5\);\s*color: var\(--pm-tobe-disabled-fg, #55627a\);/);
  // disabled-блок стоит после .ctor-btn--active (специфичность равна — порядок решает)
  assert.ok(ctor.indexOf(".ctor-btn--active {") < ctor.indexOf(".ctor-btn:disabled,"), "disabled после модификаторов");
  assert.ok(contrast("#55627a", "#f1f3f5") >= 4.5, "disabled-fg на muted");
});

test("Z0: никаких других правок значений — hover/active/primary не тронуты", () => {
  assert.match(ctor, /\.ctor-check__finding:hover \{\s*border-color: #007bff;\s*background: #eef4ff;/);
  assert.match(ctor, /\.ctor-btn--primary \{\s*border-color: #007bff;\s*background: #007bff;\s*color: #fff;/);
  assert.match(wfbar, /\.wfbar__step--done \{ color: var\(--ws-step-done, #7fce9b\); \}/);
});
