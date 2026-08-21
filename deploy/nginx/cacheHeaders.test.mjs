import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const CONFIGS = [
  "default.conf",
  "default.prod.internal.conf",
  "default.prod.tls.conf",
];

function readConfig(name) {
  return fs.readFileSync(new URL(name, import.meta.url), "utf8");
}

test("nginx configs keep assets immutable and frontend HTML cache-safe", () => {
  for (const name of CONFIGS) {
    const source = readConfig(name);
    assert.match(source, /location \/assets\/ \{[\s\S]*Cache-Control "public, max-age=31536000, immutable" always;[\s\S]*try_files \$uri =404;/, name);
    assert.match(source, /location = \/index\.html \{[\s\S]*Cache-Control "no-cache, no-store, must-revalidate" always;[\s\S]*Pragma "no-cache" always;[\s\S]*Expires "0" always;[\s\S]*try_files \$uri =404;/, name);
    assert.match(source, /location \/ \{[\s\S]*Cache-Control "no-cache, no-store, must-revalidate" always;[\s\S]*Pragma "no-cache" always;[\s\S]*Expires "0" always;[\s\S]*try_files \$uri \$uri\/ \/index\.html;/, name);
  }
});
