import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import assert from "node:assert";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
const htmlPath = join(repoRoot, "index.html");
const html = readFileSync(htmlPath, "utf8");

describe("index.html boot guard source checks", () => {
  test("boot guard reads sha or commit from version.json", () => {
    assert.match(html, /data\.sha\s*\|\|\s*data\.commit/);
  });

  test("boot guard uses URL cache-busting reload instead of plain reload", () => {
    assert.match(html, /function hardReload\s*\(/);
    assert.match(html, /__pm_cb=/);
    assert.match(html, /location\.href\s*=\s*url\s*\+\s*sep\s*\+\s*["']__pm_cb=["']\s*\+\s*Date\.now\(\)/);
  });

  test("boot guard marks single reload per build id via sessionStorage", () => {
    assert.match(html, /sessionStorage\.getItem\s*\(/);
    assert.match(html, /sessionStorage\.setItem\s*\(/);
    assert.match(html, /processmap:version-boot-reload/);
  });

  test("SW kill-switch: unregister + clearCaches выполняются ВСЕГДА (без sessionStorage-gate «processmap:sw-kill:v1»)", () => {
    assert.doesNotMatch(html, /processmap:sw-kill:v1/, "gate один-раз-за-сессию убран: kill-switch постоянный");
    assert.match(html, /navigator\.serviceWorker\.getRegistrations/);
    assert.match(html, /unregister/);
    assert.match(html, /function clearCaches/);
  });

  test("SW kill-switch: gate «один hardReload за сессию» по navigator.serviceWorker.controller сохранён", () => {
    assert.match(html, /navigator\.serviceWorker\.controller/);
    assert.match(html, /hardReload\(\)/);
  });

  test("SW kill-switch: постоянный механизм (комментарий в коде)", () => {
    assert.match(html, /постоянн/i, "в index.html зафиксировано, что kill-switch не удаляется");
  });

});
