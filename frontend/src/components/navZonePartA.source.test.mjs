import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("../features/explorer/WorkspaceExplorer.jsx", import.meta.url), "utf8");
const appShellSource = readFileSync(new URL("./AppShell.jsx", import.meta.url), "utf8");
const topBarSource = readFileSync(new URL("./TopBar.jsx", import.meta.url), "utf8");
const stripSource = readFileSync(new URL("./SessionNavStrip.jsx", import.meta.url), "utf8");
const navZoneSource = readFileSync(new URL("./NavZone.jsx", import.meta.url), "utf8");
const navZoneCss = readFileSync(new URL("./NavZone.css", import.meta.url), "utf8");
const textBreadcrumbsSource = readFileSync(new URL("./TextBreadcrumbs.jsx", import.meta.url), "utf8");

// Часть А (nav-zone, ревизия #730): навигационная зона — единая однострочная
// полоса на всех трёх уровнях: кнопка «назад», крошки, статус (если есть),
// мета. Отдельной H1-строки больше нет; H1-функцию выполняет последний сегмент
// крошек (полужирный).

test("NavZone: однострочный flex-ряд, container queries и жертвы при нехватке ширины", () => {
  assert.match(navZoneSource, /flex items-center gap-3 min-w-0 overflow-hidden/);
  assert.match(navZoneCss, /container-type: inline-size/);
  assert.match(navZoneCss, /@container \(max-width: 1099px\)/);
  assert.match(navZoneCss, /@container \(max-width: 759px\)/);
  assert.match(navZoneCss, /@container \(max-width: 639px\)/);
  assert.match(navZoneSource, /nav-zone-meta/);
  assert.match(navZoneSource, /nav-zone-back-label/);
  assert.match(navZoneSource, /nav-zone-status-label/);
});

test("TextBreadcrumbs: текущий сегмент полужирный, строка не переносится", () => {
  assert.match(textBreadcrumbsSource, /font-semibold text-fg/);
  assert.match(textBreadcrumbsSource, /flex-nowrap/);
  assert.match(textBreadcrumbsSource, /hover:underline/);
  assert.match(textBreadcrumbsSource, /data-current=\{isCurrent \? "true" : undefined\}/);
});

test("ProjectPane: однострочная навигация — NavZone с back, breadcrumbs, meta", () => {
  assert.doesNotMatch(explorerSource, /BreadcrumbChip/);
  assert.doesNotMatch(explorerSource, />Навигация</);
  assert.match(explorerSource, /import NavZone from "\.\.\/\.\.\/components\/NavZone\.jsx"/);
  assert.match(explorerSource, /<NavZone/);
  assert.match(explorerSource, /testId:\s*"project-back-section"/);
  assert.match(explorerSource, /breadcrumbsTestId="project-breadcrumbs"/);
  assert.match(explorerSource, /Сессии:\s*\$\{sessionCount\}/);
});

test("ProjectPane: отдельная H1-строка удалена", () => {
  assert.doesNotMatch(explorerSource, /data-testid="project-title"/);
});

test("ExplorerPane: однострочная навигация — NavZone с back, breadcrumbs, meta", () => {
  assert.match(explorerSource, /← Назад к разделам/);
  assert.match(explorerSource, /testId:\s*"explorer-back-sections"/);
  assert.match(explorerSource, /breadcrumbsTestId="explorer-breadcrumbs"/);
  assert.match(explorerSource, /metaTestId="explorer-section-meta"/);
});

test("ExplorerPane: отдельная H1-строка удалена", () => {
  assert.doesNotMatch(explorerSource, /data-testid="explorer-section-title"/);
});

test("AppShell: SessionNavStrip над ProcessStage при активной сессии", () => {
  assert.match(appShellSource, /import SessionNavStrip from "\.\/SessionNavStrip\.jsx"/);
  assert.match(appShellSource, /\{hasActiveSession \? \(\s*<SessionNavStrip/);
  assert.match(appShellSource, /onBackToProject=\{\(\) => onReturnToSessionList\?\.\(\)\}/);
});

test("SessionNavStrip: NavZone с back, breadcrumbs, status, meta", () => {
  assert.match(stripSource, /import NavZone from "\.\/NavZone\.jsx"/);
  assert.match(stripSource, /data-testid="session-nav-strip"/);
  assert.match(stripSource, /breadcrumbsTestId="topbar-breadcrumbs"/);
  assert.match(stripSource, /testId:\s*"topbar-session-status"/);
  assert.match(stripSource, /metaTestId="session-nav-meta"/);
  assert.doesNotMatch(stripSource, /data-testid="session-nav-title"/);
});

test("TopBar очищен: нет кнопки назад, крошек и статус-пилюли", () => {
  assert.doesNotMatch(topBarSource, /topbar-back-projects/);
  assert.doesNotMatch(topBarSource, /topbar-breadcrumbs/);
  assert.doesNotMatch(topBarSource, /topbar-session-status/);
  assert.doesNotMatch(topBarSource, /topbarCrumbs/);
  assert.doesNotMatch(topBarSource, /STATUS_CHIP_STYLES/);
});
