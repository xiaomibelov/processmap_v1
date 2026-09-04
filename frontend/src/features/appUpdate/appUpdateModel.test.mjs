import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_UPDATE_AUTO_RELOAD_DELAY_MS,
  APP_UPDATE_AUTO_RELOADED_STORAGE_KEY,
  APP_UPDATE_POLL_INTERVAL_MS,
  APP_UPDATE_SNOOZE_MS,
  APP_UPDATE_SNOOZE_STORAGE_KEY,
  APP_UPDATE_VERSION_URL,
  getCurrentBuildSha,
  getUpdateSnoozeUntil,
  hardReloadPage,
  hasAutoReloadedForSha,
  markAutoReloadedForSha,
  normalizeVersionJson,
  reloadPage,
  setUpdateSnooze,
  shouldShowUpdateToast,
} from "./appUpdateModel.js";
import { ru } from "../../shared/i18n/ru.js";
import { en } from "../../shared/i18n/en.js";

function createStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

// ---------------------------------------------------------------- version.json
test("version.json: валидный payload → {sha, builtAt}; мусор → null (молча)", () => {
  assert.deepEqual(normalizeVersionJson({ sha: "abc1234", builtAt: "2026-08-08T10:00:00Z" }), {
    sha: "abc1234",
    builtAt: "2026-08-08T10:00:00Z",
  });
  assert.equal(normalizeVersionJson(null), null);
  assert.equal(normalizeVersionJson({}), null);
  assert.equal(normalizeVersionJson({ sha: "  " }), null);
  assert.equal(normalizeVersionJson("abc"), null);
});

test("version.json: поле commit используется как fallback для sha", () => {
  assert.deepEqual(normalizeVersionJson({ commit: "def5678", buildTime: "2026-08-08T11:00:00Z" }), {
    sha: "def5678",
    builtAt: "2026-08-08T11:00:00Z",
  });
  assert.deepEqual(normalizeVersionJson({ sha: "abc1234", commit: "def5678", builtAt: "2026-08-08T10:00:00Z" }), {
    sha: "abc1234",
    builtAt: "2026-08-08T10:00:00Z",
  });
  assert.equal(normalizeVersionJson({ commit: "  " }), null);
});

test("поллинг: 5 минут, url /version.json", () => {
  assert.equal(APP_UPDATE_POLL_INTERVAL_MS, 300000);
  assert.equal(APP_UPDATE_VERSION_URL, "/version.json");
});

test("SHA бандла: из VITE_BUILD_ID/buildId, fallback dev", () => {
  assert.equal(getCurrentBuildSha({ VITE_BUILD_ID: "abc1234" }), "abc1234");
  assert.equal(getCurrentBuildSha({ buildId: "zzz9999" }), "zzz9999");
  assert.equal(getCurrentBuildSha({}), "dev");
});

// ---------------------------------------------------------------- тост
test("смена SHA → тост; тот же SHA → нет; dev → нет", () => {
  const storage = createStorage();
  assert.equal(shouldShowUpdateToast({ currentSha: "aaa1111", remoteSha: "bbb2222", storage }), true);
  assert.equal(shouldShowUpdateToast({ currentSha: "aaa1111", remoteSha: "aaa1111", storage }), false);
  assert.equal(shouldShowUpdateToast({ currentSha: "aaa1111", remoteSha: "", storage }), false);
  assert.equal(shouldShowUpdateToast({ currentSha: "aaa1111", remoteSha: "dev", storage }), false);
});

test("snooze 30 мин: [Позже] скрывает до истечения, потом показывает снова", () => {
  const storage = createStorage();
  const now = Date.now();
  setUpdateSnooze("bbb2222", now, storage);
  // сразу после snooze — скрыт
  assert.equal(shouldShowUpdateToast({ currentSha: "aaa1111", remoteSha: "bbb2222", now: now + 1000, storage }), false);
  // через 29 мин — всё ещё скрыт
  assert.equal(
    shouldShowUpdateToast({ currentSha: "aaa1111", remoteSha: "bbb2222", now: now + APP_UPDATE_SNOOZE_MS - 60000, storage }),
    false,
  );
  // через 30 мин — снова показан (та же SHA — не «постоянный dismiss»)
  assert.equal(
    shouldShowUpdateToast({ currentSha: "aaa1111", remoteSha: "bbb2222", now: now + APP_UPDATE_SNOOZE_MS + 1000, storage }),
    true,
  );
});

test("snooze хранится per-SHA и не влияет на другую SHA", () => {
  const storage = createStorage();
  const now = Date.now();
  setUpdateSnooze("bbb2222", now, storage);
  assert.equal(shouldShowUpdateToast({ currentSha: "aaa1111", remoteSha: "ccc3333", now: now + 1000, storage }), true);
  assert.ok(getUpdateSnoozeUntil("bbb2222", storage) > now);
  assert.equal(getUpdateSnoozeUntil("ccc3333", storage), 0);
});

test("snooze-мапа устойчива к битому JSON в storage", () => {
  const storage = createStorage();
  storage.setItem(APP_UPDATE_SNOOZE_STORAGE_KEY, "{broken");
  assert.equal(getUpdateSnoozeUntil("x", storage), 0);
  assert.equal(setUpdateSnooze("x", 1000, storage), true);
  assert.ok(getUpdateSnoozeUntil("x", storage) > 1000);
});

test("reloadPage — только явный вызов (по клику [Обновить] или авто-reload)", () => {
  let called = 0;
  reloadPage({ location: { reload: () => { called += 1; } } });
  assert.equal(called, 1);
  reloadPage(null); // без window — no-op, не бросает
  assert.equal(called, 1);
});

// ---------------------------------------------------------------- hardReloadPage
function createHardReloadWin({ href = "https://app.example/projects?tab=1", withSW = true, withCaches = true } = {}) {
  const unregisterSpies = [() => {}, () => {}].map((fn) => {
    let calls = 0;
    const spy = () => { calls += 1; return Promise.resolve(); };
    spy.calls = () => calls;
    return spy;
  });
  const deletedKeys = [];
  const win = { location: { href } };
  if (withSW) {
    win.navigator = {
      serviceWorker: {
        getRegistrations: () => Promise.resolve(unregisterSpies.map((spy) => ({ unregister: spy }))),
      },
    };
  } else {
    win.navigator = {};
  }
  if (withCaches) {
    win.caches = {
      keys: () => Promise.resolve(["cache-a", "cache-b"]),
      delete: (key) => { deletedKeys.push(key); return Promise.resolve(true); },
    };
  }
  return { win, unregisterSpies, deletedKeys };
}

test("hardReloadPage: unregister всех SW + очистка caches + href с __pm_cb", async () => {
  const { win, unregisterSpies, deletedKeys } = createHardReloadWin();
  await hardReloadPage(win);
  assert.equal(unregisterSpies[0].calls(), 1);
  assert.equal(unregisterSpies[1].calls(), 1);
  assert.deepEqual(deletedKeys.sort(), ["cache-a", "cache-b"]);
  assert.match(win.location.href, /__pm_cb=\d+/);
  assert.ok(win.location.href.startsWith("https://app.example/projects?tab=1&__pm_cb="), "исходный путь/параметры сохранены");
});

test("hardReloadPage: повторный __pm_cb в исходном URL заменяется, а не дублируется", async () => {
  const { win } = createHardReloadWin({ href: "https://app.example/x?__pm_cb=111&tab=1" });
  await hardReloadPage(win);
  const matches = win.location.href.match(/__pm_cb=/g) || [];
  assert.equal(matches.length, 1, "ровно один __pm_cb");
  assert.ok(!/__pm_cb=111/.test(win.location.href), "старый ts заменён");
  assert.ok(win.location.href.includes("tab=1"), "прочие параметры сохранены");
});

test("hardReloadPage: без navigator.serviceWorker/caches href всё равно меняется, не бросает", async () => {
  const { win } = createHardReloadWin({ withSW: false, withCaches: false });
  await hardReloadPage(win);
  assert.match(win.location.href, /__pm_cb=\d+/);
});

test("hardReloadPage: ошибки unregister/caches глушатся, навигация выполняется", async () => {
  const win = {
    location: { href: "https://app.example/" },
    navigator: {
      serviceWorker: {
        getRegistrations: () => Promise.resolve([
          { unregister: () => Promise.reject(new Error("boom")) },
        ]),
      },
    },
    caches: {
      keys: () => Promise.reject(new Error("boom")),
      delete: () => Promise.reject(new Error("boom")),
    },
  };
  await hardReloadPage(win);
  assert.match(win.location.href, /__pm_cb=\d+/);
});

test("hardReloadPage(null) → no-op, не бросает", async () => {
  await hardReloadPage(null);
});

// ---------------------------------------------------------------- auto-reload
test("авто-reload: один раз за сессию на remote SHA", () => {
  const storage = createStorage();
  assert.equal(hasAutoReloadedForSha("bbb2222", storage), false);
  assert.equal(markAutoReloadedForSha("bbb2222", storage), true);
  assert.equal(hasAutoReloadedForSha("bbb2222", storage), true);
  assert.equal(hasAutoReloadedForSha("ccc3333", storage), false);
});

test("авто-reload: плохой storage не ломает логику", () => {
  assert.equal(hasAutoReloadedForSha("bbb2222", null), false);
  assert.equal(markAutoReloadedForSha("bbb2222", null), false);
});

test("константы авто-reload присутствуют", () => {
  assert.equal(typeof APP_UPDATE_AUTO_RELOAD_DELAY_MS, "number");
  assert.ok(APP_UPDATE_AUTO_RELOAD_DELAY_MS >= 0);
  assert.equal(typeof APP_UPDATE_AUTO_RELOADED_STORAGE_KEY, "string");
  assert.ok(APP_UPDATE_AUTO_RELOADED_STORAGE_KEY.length > 0);
});

// ---------------------------------------------------------------- i18n
test("i18n app_update.*: ru/en паритет, непустые строки", () => {
  const ruKeys = Object.keys(ru.app_update || {}).sort();
  const enKeys = Object.keys(en.app_update || {}).sort();
  assert.deepEqual(enKeys, ruKeys, "ключи en.app_update == ru.app_update");
  assert.ok(ruKeys.length >= 8, `словарь полный (${ruKeys.length})`);
  for (const key of ruKeys) {
    assert.ok(String(ru.app_update[key] || "").trim().length > 0, `ru.${key}`);
    assert.ok(String(en.app_update[key] || "").trim().length > 0, `en.${key}`);
  }
});
