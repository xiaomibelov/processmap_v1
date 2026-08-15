import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("../features/explorer/WorkspaceExplorer.jsx", import.meta.url), "utf8");
const appShellSource = readFileSync(new URL("./AppShell.jsx", import.meta.url), "utf8");
const topBarSource = readFileSync(new URL("./TopBar.jsx", import.meta.url), "utf8");
const stripSource = readFileSync(new URL("./SessionNavStrip.jsx", import.meta.url), "utf8");

// Часть А (nav-zone): на трёх уровнях в навигационной зоне ровно два
// текстовых элемента — кнопка «назад» и строка пути; никаких чипов/подписей.

test("ProjectPane: нет чипов и подписи «Навигация», есть текстовые крошки и кнопка назад", () => {
  assert.doesNotMatch(explorerSource, /BreadcrumbChip/);
  assert.doesNotMatch(explorerSource, />Навигация</);
  assert.match(explorerSource, /← Назад к разделу/);
  assert.match(explorerSource, /data-testid="project-back-section"/);
  assert.match(explorerSource, /dataTestId="project-breadcrumbs"/);
});

test("ProjectPane: H1 проекта со статус-бейджем рядом и мета-строкой", () => {
  assert.match(explorerSource, /data-testid="project-title"/);
  assert.match(explorerSource, /<StatusBadge status=\{proj\.status\} \/>/);
  assert.match(explorerSource, /Сессии:\s*\{sessionCount\}/);
});

test("ExplorerPane: кнопка «← Назад к разделам» и текстовые крошки", () => {
  assert.match(explorerSource, /← Назад к разделам/);
  assert.match(explorerSource, /data-testid="explorer-back-sections"/);
  assert.match(explorerSource, /dataTestId="explorer-breadcrumbs"/);
  assert.match(explorerSource, /data-testid="explorer-section-title"/);
  assert.match(explorerSource, /data-testid="explorer-section-meta"/);
});

test("AppShell: полоса сессии над ProcessStage/stageOverride при активной сессии", () => {
  assert.match(appShellSource, /import SessionNavStrip from "\.\/SessionNavStrip\.jsx"/);
  assert.match(appShellSource, /\{hasActiveSession \? \(\s*<SessionNavStrip/);
  assert.match(appShellSource, /onBackToProject=\{\(\) => onReturnToSessionList\?\.\(\)\}/);
});

test("SessionNavStrip: кнопка «← Назад к проекту», крошки, H1+статус, мета", () => {
  assert.match(stripSource, /← Назад к проекту/);
  assert.match(stripSource, /data-testid="session-nav-strip"/);
  assert.match(stripSource, /dataTestId="topbar-breadcrumbs"/);
  assert.match(stripSource, /data-testid="topbar-session-status"/);
  assert.match(stripSource, /data-testid="session-nav-title"/);
  assert.match(stripSource, /data-testid="session-nav-meta"/);
});

test("TopBar очищен: нет кнопки назад, крошек и статус-пилюли", () => {
  assert.doesNotMatch(topBarSource, /topbar-back-projects/);
  assert.doesNotMatch(topBarSource, /topbar-breadcrumbs/);
  assert.doesNotMatch(topBarSource, /topbar-session-status/);
  assert.doesNotMatch(topBarSource, /topbarCrumbs/);
  assert.doesNotMatch(topBarSource, /STATUS_CHIP_STYLES/);
});
