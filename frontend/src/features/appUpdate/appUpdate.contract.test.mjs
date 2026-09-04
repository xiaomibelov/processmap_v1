import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const hookSource = fs.readFileSync(new URL("./useAppUpdateAvailable.js", import.meta.url), "utf8");
const bannerSource = fs.readFileSync(new URL("./AppUpdateBanner.jsx", import.meta.url), "utf8");
const modelSource = fs.readFileSync(new URL("./appUpdateModel.js", import.meta.url), "utf8");
const controllerSource = fs.readFileSync(new URL("./appSafeRefreshController.js", import.meta.url), "utf8");
const shellSource = fs.readFileSync(new URL("../../components/AppShell.jsx", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
const viteSource = fs.readFileSync(new URL("../../../vite.config.js", import.meta.url), "utf8");
const toastCssSource = fs.readFileSync(new URL("./appUpdateToast.css", import.meta.url), "utf8");

// ---------------------------------------------------------------- build
test("build генерирует static/version.json {sha, builtAt} в dist", () => {
  assert.match(viteSource, /app-version-json/, "плагин в vite.config");
  assert.match(viteSource, /fileName: "version\.json"/);
  assert.match(viteSource, /sha/);
  assert.match(viteSource, /builtAt/);
});

// ---------------------------------------------------------------- хук
test("хук поллит GET /version.json с cache:'no-store', без overlap-запросов", () => {
  assert.match(hookSource, /APP_UPDATE_VERSION_URL/);
  assert.match(hookSource, /cache: "no-store"/);
  assert.match(hookSource, /inFlightRef\.current/);
  assert.match(hookSource, /if \(inFlightRef\.current\) return false/);
});

test("хук: boot + interval(5 мин) + visibilitychange→visible, cleanup, ошибки молча", () => {
  assert.match(hookSource, /checkForUpdate\("boot"\)/);
  assert.match(hookSource, /window\.setInterval/);
  assert.match(hookSource, /APP_UPDATE_POLL_INTERVAL_MS/);
  assert.match(hookSource, /document\.addEventListener\("visibilitychange"/);
  assert.match(hookSource, /document\.visibilityState === "hidden"/);
  assert.match(hookSource, /window\.clearInterval/);
  assert.match(hookSource, /removeEventListener\("visibilitychange"/);
  assert.match(hookSource, /catch \{\s*\/\/ ошибки — молча/s);
  assert.doesNotMatch(hookSource, /apiMeta/, "apiMeta больше не используется");
});

test("reload через hardReloadPage ровно в двух местах (refresh после guard+flush; авто-reload в clean-состоянии); reloadPage в hook отсутствует", () => {
  const hardReloads = hookSource.match(/hardReloadPage\(window\)/g) || [];
  assert.equal(hardReloads.length, 2, "hardReloadPage(window) вызывается ровно в двух местах");
  assert.match(hookSource, /runSafeRefreshBeforeReload/);
  assert.match(hookSource, /refreshGuard/);
  assert.doesNotMatch(hookSource, /reloadPage\(/, "обычного reloadPage в hook нет");
  // checkForUpdate НЕ вызывает reload
  const checkFn = hookSource.split("const checkForUpdate")[1]?.split("useEffect")[0] || "";
  assert.doesNotMatch(checkFn, /hardReloadPage|reloadPage/);
});

test("[Позже] = snooze 30 мин (новая семантика), не постоянный dismiss", () => {
  assert.match(hookSource, /setUpdateSnooze/);
  assert.match(modelSource, /APP_UPDATE_SNOOZE_MS = 30 \* 60 \* 1000/);
  assert.doesNotMatch(modelSource, /DISMISS/, "постоянный dismiss-per-runtimeId убран");
});

// ---------------------------------------------------------------- тост
test("тост: fixed внизу, role=status, aria-live=polite, НЕ модалка", () => {
  assert.match(bannerSource, /data-testid="app-update-toast"/);
  assert.match(bannerSource, /role="status"/);
  assert.match(bannerSource, /aria-live="polite"/);
  assert.match(toastCssSource, /position: fixed/);
  assert.match(toastCssSource, /bottom: 16px/);
  assert.doesNotMatch(bannerSource, /role="dialog"|aria-modal/, "не модалка");
});

test("тост: i18n app_update.* (без хардкода RU), SVG-иконка из файла, фокус при появлении", () => {
  assert.match(bannerSource, /ru\.app_update/);
  assert.match(bannerSource, /assets\/icons\/app-update\.svg\?raw/);
  assert.match(bannerSource, /toastRef\.current\?\.focus\(\)/);
  const code = bannerSource.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(code, /Вышло обновление|Сохраните изменения|Обновите страницу/, "строк не хардкожено в коде");
});

test("стили: только токены --pm-tobe-*, transform 200ms, reduced-motion", () => {
  const hex = toastCssSource.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hex, [], `сырых hex быть не должно: ${hex.join(",")}`);
  assert.match(toastCssSource, /transition: transform 200ms/);
  assert.match(toastCssSource, /prefers-reduced-motion/);
});

// ---------------------------------------------------------------- guard TO BE
test("грязная TO BE: AppShell пробрасывает appUpdateGuard; App строит его через requestTobeExit (#672)", () => {
  assert.match(shellSource, /appUpdateGuard = null/);
  assert.match(shellSource, /useAppUpdateAvailable\(\{ refreshGuard: appUpdateGuard \}\)/);
  assert.match(appSource, /appUpdateGuardView/);
  assert.match(appSource, /requestTobeExit\(\(\) => \{\}\)/, "переиспользуем существующий guard, не дублируем");
});

test("safe-flush контроллер не изменён (грязная v1 → flush перед reload)", () => {
  assert.match(controllerSource, /runSafeRefreshBeforeReload/);
  assert.match(controllerSource, /activeHandler\.flush/);
});
