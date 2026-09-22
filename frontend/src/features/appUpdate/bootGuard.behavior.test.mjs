// UX-UPDATE — behavior-тест boot guard index.html (C2, fix/app-update-refresh-dead-end):
// неуспешная попытка version-boot reload (гонка деплоя: снова отдан старый
// index с тем же buildId) НЕ должна расходовать gate «один раз за сессию».
// Метод: inline-скрипт index.html выполняется в node:vm с моками
// document/sessionStorage/fetch/navigator/location; навигации считаются по
// присваиванию location.href.
// Запуск: node --test src/features/appUpdate/bootGuard.behavior.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
const html = readFileSync(join(repoRoot, "index.html"), "utf8");

function extractBootGuardScript(source) {
  const match = source.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, "inline <script> boot guard найден в index.html");
  return match[1];
}

function createBootEnv({ buildId, remoteSha, stored = {} }) {
  const storage = stored;
  const navigations = [];
  const sandbox = {
    console,
    Promise,
    Date,
    setTimeout,
    clearTimeout,
    sessionStorage: {
      getItem: (key) => (Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null),
      setItem: (key, value) => { storage[key] = String(value); },
    },
    document: {
      querySelector: (selector) => (
        selector.includes("processmap-build-id")
          ? { getAttribute: () => buildId }
          : null
      ),
    },
    navigator: {
      serviceWorker: {
        getRegistrations: async () => [],
        controller: false,
      },
    },
    fetch: async () => ({
      json: async () => ({ sha: remoteSha, commit: remoteSha }),
    }),
    location: {
      href: "https://localhost/app",
    },
  };
  sandbox.window = sandbox;
  Object.defineProperty(sandbox.location, "href", {
    get() { return sandbox.__href; },
    set(value) {
      sandbox.__href = String(value);
      navigations.push(String(value));
    },
  });
  sandbox.__href = "https://localhost/app";
  sandbox.__navigations = navigations;
  sandbox.__storage = storage;
  return sandbox;
}

async function runBootGuard(sandbox) {
  vm.createContext(sandbox);
  vm.runInContext(extractBootGuardScript(html), sandbox, { filename: "index.html#boot-guard" });
  await new Promise((resolve) => setTimeout(resolve, 5));
}

const STALE_BUILD = "8208fd57";
const NEW_BUILD = "c5db40a9";

test("C2: гонка деплоя — повторная загрузка со старым buildId ретритится (gate не сгорает после 1 неудачной попытки)", async () => {
  const storage = {};

  // Попытка 1: version.json уже новый, index.html ещё старый → hardReload.
  await runBootGuard(createBootEnv({ buildId: STALE_BUILD, remoteSha: NEW_BUILD, stored: storage }));
  assert.equal(storage["processmap:version-boot-reload:" + STALE_BUILD], "1", "gate потребовался");

  // Перезагрузка отдала ТОТ ЖЕ старый index (гонка деплоя) — вторая попытка ОБЯЗАНА быть.
  const second = createBootEnv({ buildId: STALE_BUILD, remoteSha: NEW_BUILD, stored: storage });
  await runBootGuard(second);
  assert.equal(second.__navigations.length, 1, "вторая загрузка со старым buildId ретритится, gate не израсходован впустую");
});

test("C2: цикл невозможен — не более 3 попыток на buildId за сессию вкладки", async () => {
  const storage = {};
  const attempts = [];
  for (let i = 1; i <= 5; i += 1) {
    const env = createBootEnv({ buildId: STALE_BUILD, remoteSha: NEW_BUILD, stored: storage });
    await runBootGuard(env);
    attempts.push(env.__navigations.length);
  }
  assert.deepEqual(attempts, [1, 1, 1, 0, 0], "3 попытки максимум, дальше gate закрыт");
});
