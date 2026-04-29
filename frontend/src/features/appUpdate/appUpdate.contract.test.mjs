import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const hookSource = fs.readFileSync(new URL("./useAppUpdateAvailable.js", import.meta.url), "utf8");
const bannerSource = fs.readFileSync(new URL("./AppUpdateBanner.jsx", import.meta.url), "utf8");
const controllerSource = fs.readFileSync(new URL("./appSafeRefreshController.js", import.meta.url), "utf8");
const shellSource = fs.readFileSync(new URL("../../components/AppShell.jsx", import.meta.url), "utf8");
const processStageSource = fs.readFileSync(new URL("../../components/ProcessStage.jsx", import.meta.url), "utf8");

test("app update hook polls /api/meta through apiMeta without overlapping requests", () => {
  assert.match(hookSource, /import \{ apiMeta \} from "\.\.\/\.\.\/lib\/api\.js"/);
  assert.match(hookSource, /const res = await apiMeta\(\)/);
  assert.match(hookSource, /inFlightRef\.current/);
  assert.match(hookSource, /if \(inFlightRef\.current\) return false/);
});

test("app update hook uses boot, interval, focus, and visible-tab checks with cleanup", () => {
  assert.match(hookSource, /checkForUpdate\("boot"\)/);
  assert.match(hookSource, /window\.setInterval/);
  assert.match(hookSource, /APP_UPDATE_POLL_INTERVAL_MS/);
  assert.match(hookSource, /window\.addEventListener\("focus"/);
  assert.match(hookSource, /document\.addEventListener\("visibilitychange"/);
  assert.match(hookSource, /document\.visibilityState === "hidden"/);
  assert.match(hookSource, /window\.clearInterval/);
  assert.match(hookSource, /removeEventListener\("focus"/);
  assert.match(hookSource, /removeEventListener\("visibilitychange"/);
});

test("app update hook silently hides banner on failed or missing meta and never auto reloads", () => {
  assert.match(hookSource, /if \(!res\?\.ok\) \{/);
  assert.match(hookSource, /setAvailableRuntime\(null\)/);
  assert.equal(hookSource.includes("reloadPage(window);"), true);
  assert.ok(hookSource.indexOf("reloadPage(window);") > hookSource.indexOf("runSafeRefreshBeforeReload"));
});

test("app update banner has the expected copy and safe refresh/dismiss actions", () => {
  assert.match(bannerSource, /Доступна новая версия ProcessMap\./);
  assert.match(bannerSource, /Сохраните изменения перед обновлением/);
  assert.match(bannerSource, /Обновите страницу, чтобы получить последние исправления/);
  assert.match(bannerSource, /Обновить/);
  assert.match(bannerSource, /Сохранить и обновить/);
  assert.match(bannerSource, /Позже/);
  assert.match(bannerSource, /disabled=\{actionDisabled\}/);
  assert.match(bannerSource, /onClick=\{onRefresh\}/);
  assert.match(bannerSource, /onClick=\{onDismiss\}/);
  assert.match(bannerSource, /data-testid="app-update-banner"/);
  assert.match(bannerSource, /role="status"/);
});

test("AppShell renders the app-level update banner below TopBar and before session notice", () => {
  assert.match(shellSource, /import AppUpdateBanner from "\.\.\/features\/appUpdate\/AppUpdateBanner\.jsx"/);
  assert.match(shellSource, /useAppUpdateAvailable/);
  assert.ok(shellSource.indexOf("<TopBar") < shellSource.indexOf("<AppUpdateBanner"));
  assert.ok(shellSource.indexOf("<AppUpdateBanner") < shellSource.indexOf("{sessionNavNotice ?"));
  assert.match(shellSource, /refreshRisk=\{appUpdate\.refreshRisk\}/);
  assert.match(shellSource, /refreshBusy=\{appUpdate\.refreshBusy\}/);
  assert.match(shellSource, /refreshError=\{appUpdate\.refreshError\}/);
  assert.match(shellSource, /Версия \{appVersionInfo\.currentVersion\}/);
});

test("app update banner is not wired into ProcessStage remote-save toast", () => {
  assert.equal(hookSource.includes("ProcessSaveAckToast"), false);
  assert.equal(bannerSource.includes("ProcessSaveAckToast"), false);
  assert.equal(shellSource.includes("ProcessSaveAckToast"), false);
  assert.match(processStageSource, /ProcessSaveAckToast/);
});

test("app update safe refresh uses a single coordinator and app update reason", () => {
  assert.match(hookSource, /runSafeRefreshBeforeReload\(\{ reason: "app_update_refresh" \}\)/);
  assert.match(controllerSource, /registerAppSafeRefreshHandler/);
  assert.match(controllerSource, /getCurrentAppRefreshRisk/);
  assert.match(controllerSource, /ok: true,\s*status: "clean"/);
  assert.match(controllerSource, /status: "timeout"/);
  assert.match(processStageSource, /registerAppSafeRefreshHandler/);
  assert.match(processStageSource, /source: "app_update_refresh"/);
  assert.match(processStageSource, /reason,\s*\}/);
});
