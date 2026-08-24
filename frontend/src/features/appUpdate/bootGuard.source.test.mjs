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

  test("boot guard performs hard reload to bypass disk cache", () => {
    const reloadCalls = (html.match(/\.reload\s*\(/g) || []).length;
    assert.ok(reloadCalls >= 2, `expected at least 2 location.reload calls, found ${reloadCalls}`);
    assert.match(html, /\.reload\s*\(\s*true\s*\)/);
  });

  test("boot guard marks single reload per build id via sessionStorage", () => {
    assert.match(html, /sessionStorage\.getItem\s*\(/);
    assert.match(html, /sessionStorage\.setItem\s*\(/);
    assert.match(html, /processmap:version-boot-reload/);
  });
});
