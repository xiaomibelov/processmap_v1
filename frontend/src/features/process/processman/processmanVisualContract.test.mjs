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
  assert.doesNotMatch(panelSrc, /pm-processman__mission/, "panel header does not carry a clipped subtitle");
  assert.match(panelSrc, /processman-workbench/, "chat body is wrapped as a branded workbench");
  assert.match(panelSrc, /processman-new-conversation/, "header exposes a new conversation icon action");
  assert.doesNotMatch(panelSrc, /processmanRunbook/, "footer no longer carries duplicated quick-action copy");
  assert.doesNotMatch(panelSrc, /processman-cache-badge/, "cache/new request chip is not rendered in the footer");
  assert.doesNotMatch(panelSrc, /processman-feedback/, "feedback is not rendered in the panel footer");
});

test("PROCESSMAN chat feed has distinct assistant/user message architecture", () => {
  assert.match(feedSrc, /pm-processman-msg__avatar-row/, "assistant card has one compact avatar row");
  assert.match(feedSrc, /pm-processman-msg__actions/, "message-level feedback/actions live under the answer");
  assert.match(feedSrc, /processman-candidate-card/, "suggest-next candidates render as cards");
  assert.match(feedSrc, /hasAgentContent/, "empty agent messages are guarded from rendering");
  assert.doesNotMatch(feedSrc, /pm-processman-msg__role/, "assistant messages do not repeat the panel mission");
  assert.doesNotMatch(feedSrc, /pm-processman-msg__agent-name/, "assistant messages do not repeat PROCESSMAN");
  assert.doesNotMatch(feedSrc, /pm-processman-msg__user-label/, "user bubbles do not repeat the user label");
});

test("PROCESSMAN visual system uses TO BE tokens and responsive chat dimensions", () => {
  for (const token of [
    "--pm-tobe-assistant",
    "--pm-tobe-assistant-soft",
    "--pm-tobe-destructive",
    "--pm-tobe-shadow-pop",
    "--pm-tobe-surface",
  ]) {
    assert.ok(cssSrc.includes(`var(${token}`), `${token} is used in PROCESSMAN CSS`);
  }
  assert.match(cssSrc, /\.pm-processman-workbench/, "workbench CSS exists");
  assert.match(cssSrc, /grid-template-rows: minmax\(0, 1fr\) auto/, "chat reserves stable feed/composer rows");
  assert.match(cssSrc, /@media \(max-width: 640px\)/, "mobile contract exists");
  assert.doesNotMatch(cssSrc, /linear-gradient\([^;]*--pm-tobe-assistant/, "no AI purple gradient treatment");
});

test("PROCESSMAN source does not use emoji as action icons", () => {
  const source = `${panelSrc}\n${feedSrc}`;
  assert.doesNotMatch(source, /[👍👎💡⚠📍➤↻]/u);
});
