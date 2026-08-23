// I18N-INVARIANT: every static dictionary key read from the source code
// must be present in BOTH ru.js and en.js.
//
// Covers:
// - getDict().<ns>.<key> chains
// - t("<ns>.<key>") / t('<ns>.<key>') / t(`<ns>.<key>`) calls
//
// Dynamic keys (template literals with interpolation, variables) are skipped
// because they cannot be statically verified.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ru } from "./ru.js";
import { en } from "./en.js";
import { KNOWN_MISSING_KEYS } from "./i18nKnownMissingKeys.mjs";

const __dirname = new URL(".", import.meta.url).pathname;
const SRC_DIR = join(__dirname, "..", "..");

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build"]);
const SOURCE_RE = /\.(js|jsx|mjs)$/;
const TEST_RE = /\.test\./;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (IGNORED_DIRS.has(entry)) continue;
      walk(path, files);
    } else if (SOURCE_RE.test(entry) && !TEST_RE.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

function getValue(dict, keyPath) {
  return keyPath.split(".").reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : undefined), dict);
}

function isLeafString(dict, keyPath) {
  const value = getValue(dict, keyPath);
  return typeof value === "string";
}

function isValidKeyPath(dict, keyPath) {
  const parts = keyPath.split(".");
  let current = dict;
  for (const part of parts) {
    if (current == null || typeof current !== "object" || !(part in current)) {
      return false;
    }
    current = current[part];
  }
  return true;
}

function collectKeys() {
  // getDict().a.b.c or getDict().a?.b.c
  // Capture namespace + at least one nested key. A lone getDict().diagram
  // (used as an object namespace) is not a leaf key and is ignored.
  const getDictRe = /getDict\(\)\s*\?*\.\s*([a-zA-Z_$][\w$]*(?:\s*\?*\.\s*[a-zA-Z_$][\w$]*)+)/g;
  // t("key") / t('key') / t(`key`) without interpolation
  const tRe = /\bt\s*\(\s*(['"`])([^'"`]*?)\1\s*\)/g;

  const byFile = [];

  for (const file of walk(SRC_DIR)) {
    const content = readFileSync(file, "utf8");
    const fileKeys = [];

    let m;
    getDictRe.lastIndex = 0;
    while ((m = getDictRe.exec(content)) !== null) {
      const key = m[1].replace(/\s*\?*\.\s*/g, ".");
      // Require at least namespace.key (ignore getDict().diagram as object).
      if (key.split(".").length < 2) continue;
      fileKeys.push({ key, type: "getDict", snippet: m[0] });
    }

    tRe.lastIndex = 0;
    while ((m = tRe.exec(content)) !== null) {
      const key = m[2];
      // Skip empty or obviously dynamic template literals.
      if (!key || key.includes("${")) continue;
      fileKeys.push({ key, type: "t", snippet: m[0] });
    }

    if (fileKeys.length) {
      byFile.push({ file: relative(SRC_DIR, file), keys: fileKeys });
    }
  }

  return byFile;
}

describe("i18n keys invariant", () => {
  it("every static key used in source code exists in both ru.js and en.js", () => {
    const byFile = collectKeys();
    const missing = [];

    const noLongerMissing = [];

    for (const { file, keys } of byFile) {
      for (const { key, type, snippet } of keys) {
        const ruHas = isValidKeyPath(ru, key) && isLeafString(ru, key);
        const enHas = isValidKeyPath(en, key) && isLeafString(en, key);
        if (ruHas && enHas) {
          if (KNOWN_MISSING_KEYS.has(key)) {
            noLongerMissing.push({ file, key, type, snippet });
          }
          continue;
        }
        if (!KNOWN_MISSING_KEYS.has(key)) {
          missing.push({ file, key, type, snippet, ruHas, enHas });
        }
      }
    }

    const messages = [];
    if (missing.length > 0) {
      messages.push(
        "Missing i18n keys in dictionaries:\n" +
          missing
            .map((m) => `  - ${m.file}: ${m.type}(${m.snippet}) key="${m.key}" ru=${m.ruHas} en=${m.enHas}`)
            .join("\n"),
      );
    }
    if (noLongerMissing.length > 0) {
      messages.push(
        "Keys are now present in both dictionaries; remove them from KNOWN_MISSING_KEYS:\n" +
          noLongerMissing.map((m) => `  - ${m.key}`).join("\n"),
      );
    }
    if (messages.length > 0) {
      assert.fail(messages.join("\n\n"));
    }
  });
});
