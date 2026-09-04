import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readExplorerSources } from "../test-utils/explorerSourceText.mjs";

// Часть А-2 (nav-zone): навигационная зона — ОДНА строка на всех трёх
// уровнях (раздел/проект/сессия). Кнопка «назад» слева, текстовые крошки
// (текущий сегмент полужирный, заменяет H1), статус-бейдж после него, мета
// справа через «·». Строка не переносится; жертвы по ширине контейнера:
// мета → крошки через «…» → статус точкой → кнопка иконкой.

// retarget(s0): tests 1-3 read the multifile explorer source set (WorkspaceExplorer.jsx
// is decomposed into sibling files). Tests 4-7 read files that do not move and are
// still read directly.
const { text: explorerSource } = readExplorerSources();
const appShellSource = readFileSync(new URL("./AppShell.jsx", import.meta.url), "utf8");
const topBarSource = readFileSync(new URL("./TopBar.jsx", import.meta.url), "utf8");
const stripSource = readFileSync(new URL("./SessionNavStrip.jsx", import.meta.url), "utf8");
const breadcrumbsSource = readFileSync(new URL("./TextBreadcrumbs.jsx", import.meta.url), "utf8");

test("ProjectPane: одна flex-строка без переноса, кнопка назад и крошки в ней", () => {
  assert.match(explorerSource, /Назад к проекту/);
  assert.match(explorerSource, /data-testid="project-back-section"/);
  assert.match(explorerSource, /dataTestId="project-breadcrumbs"/);
  // однострочный контейнер: nowrap + overflow-hidden + высота строки
  assert.match(explorerSource, /flex h-\[var\(--explorer-header-h\)\] min-w-0 flex-nowrap items-center overflow-hidden whitespace-nowrap/);
  // H1 как отдельного блока больше нет — testid заголовка на текущем сегменте крошек
  assert.doesNotMatch(explorerSource, /<h1[^>]*data-testid="project-title"/);
  // retarget(s0): the crumb array was renamed from projectBreadcrumbTrail to
  // projectHeaderDisplayCrumbs in the source; intent (current crumb carries the title
  // testid) is unchanged.
  assert.match(explorerSource, /testId: index === projectHeaderDisplayCrumbs\.length - 1 \? "project-title" : undefined/);
});

test("ProjectPane: статус-контрол в строке навигации, мета проекта в sidebar context", () => {
  assert.match(explorerSource, /<StatusPopoverControl/);
  assert.match(explorerSource, /domain="project"/);
  assert.match(explorerSource, /value=\{proj\.status\}/);
  assert.match(explorerSource, /const projectSidebarContextInfo = proj \? \{ type: "project", project: proj, sessionCount: sessions\.length \} : null/);
  assert.match(explorerSource, /useSetExplorerSidebarContextInfo\(projectSidebarContextInfo\)/);
  assert.doesNotMatch(explorerSource, /data-testid="project-meta"/);
});

test("ExplorerPane: кнопка «← Назад к разделам», крошки в одной строке; мета workspace перенесена в сайдбар", () => {
  assert.match(explorerSource, /Назад к разделам/);
  assert.match(explorerSource, /data-testid="explorer-back-sections"/);
  assert.match(explorerSource, /dataTestId="explorer-breadcrumbs"/);
  assert.doesNotMatch(explorerSource, /<h1[^>]*data-testid="explorer-section-title"/);
  assert.match(explorerSource, /testId: index === headerDisplayCrumbs\.length - 1 \? "explorer-section-title" : undefined/);
  assert.doesNotMatch(explorerSource, /data-testid="explorer-section-meta"/);
});

test("AppShell: полоса сессии над ProcessStage/stageOverride при активной сессии", () => {
  assert.match(appShellSource, /import SessionNavStrip from "\.\/SessionNavStrip\.jsx"/);
  assert.match(appShellSource, /\{hasActiveSession \? \(\s*<SessionNavStrip/);
  assert.match(appShellSource, /onBackToProject=\{\(\) => onReturnToSessionList\?\.\(\)\}/);
});

test("SessionNavStrip: однострочная полоса — кнопка, крошки, статус, мета", () => {
  assert.match(stripSource, /Назад к проекту/);
  assert.match(stripSource, /data-testid="session-nav-strip"/);
  assert.match(stripSource, /flex h-10 min-w-0 flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap/);
  assert.match(stripSource, /dataTestId="topbar-breadcrumbs"/);
  assert.match(stripSource, /data-testid="topbar-session-status"/);
  // H1 отдельно нет — testid заголовка на текущем сегменте крошек
  assert.doesNotMatch(stripSource, /<h1/);
  assert.match(stripSource, /testId: "session-nav-title"/);
  assert.match(stripSource, /data-testid="session-nav-meta"/);
  // адаптив: ResizeObserver-хук + чистая функция порогов
  // (пороги getNavSingleLineLayout/getWorkspaceHeaderLayout покрыты
  // поведенчески в components/navSingleLineLayout.test.mjs)
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

// П4 (а): пилюля статуса сессии — интерактивный контрол. Поповер рендерится
// через portal/fixed-позиционирование от якоря, чтобы не обрезаться
// overflow-hidden строки полосы; опции фильтруются transition-матрицей.
test("SessionNavStrip: пилюля статуса интерактивна — button с popover-меню", () => {
  // пилюля с testid topbar-session-status живёт на <button> (реальная кликабельность)
  assert.match(stripSource, /<button[^>]*data-testid="topbar-session-status"/);
  assert.match(stripSource, /aria-haspopup="menu"/);
  assert.match(stripSource, /aria-expanded=\{statusMenuOpen/);
  // опции меню — только допустимые переходы из матрицы sessionStatus.js
  assert.match(stripSource, /getAllowedNextStatuses/);
  // меню уходит в portal на document.body с fixed-позиционированием (z поверх topbar)
  assert.match(stripSource, /createPortal\([\s\S]*document\.body/);
  assert.match(stripSource, /data-testid="session-status-menu"/);
  assert.match(stripSource, /fixed z-\[140\]/);
  // смена статуса идёт через прокинутый обработчик optimistic-обновления
  assert.match(stripSource, /onChangeStatus\?\.\(option\.value\)/);
  // закрытие по клику вне меню и по Escape
  assert.match(stripSource, /Escape/);
});

// П4: мёртвый проп onChangeSessionStatus убран из TopBar и переключён
// на реальное потребление в SessionNavStrip (AppShell).
test("AppShell: onChangeSessionStatus уходит в SessionNavStrip, TopBar очищен", () => {
  const topBarCall = appShellSource.slice(
    appShellSource.indexOf("<TopBar"),
    appShellSource.indexOf("/>", appShellSource.indexOf("<TopBar")),
  );
  assert.doesNotMatch(topBarCall, /onChangeSessionStatus/);
  const stripCall = appShellSource.slice(
    appShellSource.indexOf("<SessionNavStrip"),
    appShellSource.indexOf("/>", appShellSource.indexOf("<SessionNavStrip")),
  );
  assert.match(stripCall, /onChangeStatus=\{onChangeSessionStatus\}/);
  assert.doesNotMatch(topBarSource, /onChangeSessionStatus/);
});
