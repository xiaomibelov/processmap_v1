// Visual contract for the PROCESSMAN agent chat surface.
// These checks intentionally guard the production-facing chat, not screenshots:
// stage should expose a clearly branded PROCESSMAN console with the same
// design tokens as the diagram assistant.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const panelSrc = readFileSync(fileURLToPath(new URL("./ProcessmanPanel.jsx", import.meta.url)), "utf8");
const feedSrc = readFileSync(fileURLToPath(new URL("./ProcessmanChatFeed.jsx", import.meta.url)), "utf8");
const cssSrc = readFileSync(fileURLToPath(new URL("./processman.css", import.meta.url)), "utf8");
const ruSrc = readFileSync(fileURLToPath(new URL("../../../shared/i18n/ru.js", import.meta.url)), "utf8");

test("PROCESSMAN panel presents a real agent chat console, not a plain side drawer", () => {
  assert.match(panelSrc, /pm-processman__mission/, "panel header has an agent mission line");
  assert.match(panelSrc, /processman-workbench/, "chat body is wrapped as a branded workbench");
  assert.match(panelSrc, /processmanWorkbench/, "workbench label is localized");
  assert.match(panelSrc, /processmanRunbook/, "footer exposes an operational runbook cue");
  assert.match(ruSrc, /processmanRunbook: "Контекст \+ ответ \+ действия"/, "Russian copy names the visible chat system");
  assert.match(ruSrc, /processmanWorkbench: "Рабочее место агента"/, "Russian copy names the workbench");
});

test("PROCESSMAN chat feed has distinct assistant/user message architecture", () => {
  assert.match(feedSrc, /pm-processman-msg__rail/, "assistant card has a visual rail");
  assert.match(feedSrc, /pm-processman-msg__role/, "assistant card names the speaking role");
  assert.match(feedSrc, /pm-processman-feed__ambient/, "feed includes a non-blocking activity surface");
});

test("PROCESSMAN visual system uses TO BE tokens and responsive chat dimensions", () => {
  for (const token of [
    "--pm-tobe-assistant",
    "--pm-tobe-assistant-soft",
    "--pm-tobe-shadow-pop",
    "--pm-tobe-surface",
  ]) {
    assert.ok(cssSrc.includes(`var(${token}`), `${token} is used in PROCESSMAN CSS`);
  }
  assert.match(cssSrc, /\.pm-processman-workbench/, "workbench CSS exists");
  assert.match(cssSrc, /grid-template-rows: minmax\(0, 1fr\) auto/, "chat reserves stable feed/composer rows");
  assert.match(cssSrc, /@media \(max-width: 640px\)/, "mobile contract exists");
});
