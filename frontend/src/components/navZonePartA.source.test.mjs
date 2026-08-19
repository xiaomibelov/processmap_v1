import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("../features/explorer/WorkspaceExplorer.jsx", import.meta.url), "utf8");
const appShellSource = readFileSync(new URL("./AppShell.jsx", import.meta.url), "utf8");
const topBarSource = readFileSync(new URL("./TopBar.jsx", import.meta.url), "utf8");
const stripSource = readFileSync(new URL("./SessionNavStrip.jsx", import.meta.url), "utf8");
const breadcrumbsSource = readFileSync(new URL("./TextBreadcrumbs.jsx", import.meta.url), "utf8");

// Часть А-2 (nav-zone): навигационная зона — ОДНА строка на всех трёх
// уровнях (раздел/проект/сессия). Кнопка «назад» слева, текстовые крошки
// (текущий сегмент полужирный, заменяет H1), статус-бейдж после него, мета
// справа через «·». Строка не переносится; жертвы по ширине контейнера:
// мета → крошки через «…» → статус точкой → кнопка иконкой.

test("ProjectPane: одна flex-строка без переноса, кнопка назад и крошки в ней", () => {
  assert.match(explorerSource, /← Назад к разделу/);
  assert.match(explorerSource, /data-testid="project-back-section"/);
  assert.match(explorerSource, /dataTestId="project-breadcrumbs"/);
  // однострочный контейнер: nowrap + overflow-hidden + высота строки
  assert.match(explorerSource, /flex h-10 min-w-0 flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap/);
  // H1 как отдельного блока больше нет — testid заголовка на текущем сегменте крошек
  assert.doesNotMatch(explorerSource, /<h1[^>]*data-testid="project-title"/);
  assert.match(explorerSource, /testId: index === projectBreadcrumbTrail\.length - 1 \? "project-title" : undefined/);
});

test("ProjectPane: статус-контрол и мета «Сессии: N» в строке навигации", () => {
  assert.match(explorerSource, /<StatusPopoverControl/);
  assert.match(explorerSource, /domain="project"/);
  assert.match(explorerSource, /value=\{proj\.status\}/);
  assert.match(explorerSource, /`· \$\{sessionCountersFull\}`/);
  assert.match(explorerSource, /data-testid="project-meta"/);
});

test("ExplorerPane: кнопка «← Назад к разделам», крошки в одной строке; мета workspace перенесена в сайдбар", () => {
  assert.match(explorerSource, /← Назад к разделам/);
  assert.match(explorerSource, /data-testid="explorer-back-sections"/);
  assert.match(explorerSource, /dataTestId="explorer-breadcrumbs"/);
  assert.doesNotMatch(explorerSource, /<h1[^>]*data-testid="explorer-section-title"/);
  assert.match(explorerSource, /testId: index === headerCrumbs\.length - 1 \? "explorer-section-title" : undefined/);
  assert.doesNotMatch(explorerSource, /data-testid="explorer-section-meta"/);
});

test("AppShell: полоса сессии над ProcessStage/stageOverride при активной сессии", () => {
  assert.match(appShellSource, /import SessionNavStrip from "\.\/SessionNavStrip\.jsx"/);
  assert.match(appShellSource, /\{hasActiveSession \? \(\s*<SessionNavStrip/);
  assert.match(appShellSource, /onBackToProject=\{\(\) => onReturnToSessionList\?\.\(\)\}/);
});

test("SessionNavStrip: однострочная полоса — кнопка, крошки, статус, мета", () => {
  assert.match(stripSource, /← Назад к проекту/);
  assert.match(stripSource, /data-testid="session-nav-strip"/);
  assert.match(stripSource, /flex h-10 min-w-0 flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap/);
  assert.match(stripSource, /dataTestId="topbar-breadcrumbs"/);
  assert.match(stripSource, /data-testid="topbar-session-status"/);
  // H1 отдельно нет — testid заголовка на текущем сегменте крошек
  assert.doesNotMatch(stripSource, /<h1/);
  assert.match(stripSource, /testId: "session-nav-title"/);
  assert.match(stripSource, /data-testid="session-nav-meta"/);
  // адаптив: ResizeObserver-хук + чистая функция порогов
  assert.match(stripSource, /useElementWidth/);
  assert.match(stripSource, /getNavSingleLineLayout\(stripWidth\)/);
});

test("TextBreadcrumbs: однострочный режим (nowrap) и акцент текущего сегмента", () => {
  assert.match(breadcrumbsSource, /singleLine/);
  assert.match(breadcrumbsSource, /flex-nowrap overflow-hidden whitespace-nowrap/);
  assert.match(breadcrumbsSource, /currentClassName/);
  assert.match(breadcrumbsSource, /forceCollapse/);
});

test("TopBar очищен: нет кнопки назад, крошек и статус-пилюли", () => {
  assert.doesNotMatch(topBarSource, /topbar-back-projects/);
  assert.doesNotMatch(topBarSource, /topbar-breadcrumbs/);
  assert.doesNotMatch(topBarSource, /topbar-session-status/);
  assert.doesNotMatch(topBarSource, /topbarCrumbs/);
  assert.doesNotMatch(topBarSource, /STATUS_CHIP_STYLES/);
});
