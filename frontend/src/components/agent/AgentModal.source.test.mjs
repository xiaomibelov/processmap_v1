// Legacy global agent modal must not drift away from PROCESSMAN branding.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const modalSrc = readFileSync(fileURLToPath(new URL("./AgentModal.tsx", import.meta.url)), "utf8");
const buttonSrc = readFileSync(fileURLToPath(new URL("./AgentButton.tsx", import.meta.url)), "utf8");

test("legacy AgentModal does not ship hardcoded infra or inline dark throwaway UI", () => {
  assert.doesNotMatch(modalSrc, /91\.184\.252\.237|http:\/\/[^'"]+/, "no hardcoded production-adjacent IP/API URL");
  assert.doesNotMatch(modalSrc, /style=\{\{/, "modal uses CSS classes, not inline styling");
  assert.match(modalSrc, /agent-processman-modal/, "modal uses the shared PROCESSMAN visual class namespace");
});

test("legacy agent entry point is branded as PROCESSMAN", () => {
  assert.doesNotMatch(buttonSrc, /🤖 AI Агент/, "old generic agent label is gone");
  assert.match(buttonSrc, /PROCESSMAN/, "entry point uses PROCESSMAN label");
  assert.match(buttonSrc, /agent-processman-button/, "button uses stable CSS class");
});
