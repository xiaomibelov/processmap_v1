import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_UPDATE_POLL_INTERVAL_MS,
  APP_UPDATE_SNOOZE_MS,
  APP_UPDATE_SNOOZE_STORAGE_KEY,
  APP_UPDATE_VERSION_URL,
  getCurrentBuildSha,
  getUpdateSnoozeUntil,
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

test("reloadPage — только явный вызов (по клику [Обновить])", () => {
  let called = 0;
  reloadPage({ location: { reload: () => { called += 1; } } });
  assert.equal(called, 1);
  reloadPage(null); // без window — no-op, не бросает
  assert.equal(called, 1);
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
