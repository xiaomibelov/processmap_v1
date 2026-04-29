import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_UPDATE_DISMISS_STORAGE_KEY,
  APP_UPDATE_POLL_INTERVAL_MS,
  getDismissedRuntimeId,
  getRuntimeDismissId,
  isNewRuntimeAvailable,
  normalizeRuntimeMeta,
  reloadPage,
  setDismissedRuntimeId,
  shouldShowUpdateBanner,
} from "./appUpdateModel.js";

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

test("app update model hides banner when runtime version equals client version", () => {
  const runtime = normalizeRuntimeMeta({
    runtime: {
      app_version: "v1.0.67",
      build_id: "runtime-build-1",
    },
  });
  assert.equal(isNewRuntimeAvailable({ currentVersion: "v1.0.67", runtime }), false);
  assert.equal(shouldShowUpdateBanner({ currentVersion: "v1.0.67", runtime, storage: createStorage() }), false);
});

test("app update model shows banner when runtime app version differs", () => {
  const runtime = normalizeRuntimeMeta({
    runtime: {
      app_version: "v1.0.68",
      build_id: "runtime-build-2",
      git_sha: "abc123",
      min_supported_frontend_version: "v1.0.67",
    },
  });
  assert.equal(isNewRuntimeAvailable({ currentVersion: "v1.0.67", runtime }), true);
  assert.equal(shouldShowUpdateBanner({ currentVersion: "v1.0.67", runtime, storage: createStorage() }), true);
  assert.equal(runtime.gitSha, "abc123");
  assert.equal(runtime.minSupportedFrontendVersion, "v1.0.67");
});

test("app update model hides banner when runtime is missing or unknown", () => {
  assert.equal(normalizeRuntimeMeta({}), null);
  assert.equal(normalizeRuntimeMeta({ runtime: { app_version: "unknown", build_id: "unknown" } }), null);
  assert.equal(shouldShowUpdateBanner({ currentVersion: "v1.0.67", runtime: null, storage: createStorage() }), false);
});

test("app update dismiss is scoped to the current runtime id", () => {
  const storage = createStorage();
  const dismissed = normalizeRuntimeMeta({ runtime: { app_version: "v1.0.68", build_id: "build-a" } });
  const next = normalizeRuntimeMeta({ runtime: { app_version: "v1.0.69", build_id: "build-b" } });

  assert.equal(getRuntimeDismissId(dismissed), "build-a");
  assert.equal(setDismissedRuntimeId(getRuntimeDismissId(dismissed), storage), true);
  assert.equal(getDismissedRuntimeId(storage), "build-a");
  assert.equal(storage.getItem(APP_UPDATE_DISMISS_STORAGE_KEY), "build-a");
  assert.equal(shouldShowUpdateBanner({ currentVersion: "v1.0.67", runtime: dismissed, storage }), false);
  assert.equal(shouldShowUpdateBanner({ currentVersion: "v1.0.67", runtime: next, storage }), true);
});

test("app update reload action uses ordinary page reload", () => {
  let called = 0;
  reloadPage({ location: { reload: () => { called += 1; } } });
  assert.equal(called, 1);
});

test("app update polling interval is not aggressive", () => {
  assert.equal(APP_UPDATE_POLL_INTERVAL_MS, 120000);
});
