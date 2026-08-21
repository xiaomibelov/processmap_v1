import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const notesPanelSource = fs.readFileSync(new URL("../NotesPanel.jsx", import.meta.url), "utf8");
const sectionSource = fs.readFileSync(new URL("./AIQuestionsSection.jsx", import.meta.url), "utf8");

test("AI question rows expose calm row-level trust-status copy for saved/local/syncing/error", () => {
  assert.match(sectionSource, /label: "Сохранено"/);
  assert.match(sectionSource, /label: "Есть локальные изменения"/);
  assert.match(sectionSource, /label: "Синхронизация…"/);
  assert.match(sectionSource, /label: "Ошибка"/);
  assert.match(sectionSource, /helper: "Изменения по вопросу сохранены\."/);
  assert.match(sectionSource, /helper: "Комментарий изменён локально\."/);
  assert.match(sectionSource, /helper: "Изменения по вопросу сохраняются\."/);
  assert.match(sectionSource, /helper: "Не удалось сохранить изменения по вопросу\. Текст остался в поле\."/);
  assert.match(sectionSource, /<SidebarTrustStatus/);
  assert.match(sectionSource, /testIdPrefix=\{`ai-question-status-\$\{qid\}`\}/);
});

test("AI question rows keep CTA discipline: only error exposes retry", () => {
  assert.match(sectionSource, /cta: "Повторить"/);
  assert.match(sectionSource, /ctaClassName="px-2"/);
});

test("AI question rows derive trust state per qid with precedence syncing > error > local > saved", () => {
  assert.match(sectionSource, /const hasLocalChanges = comment !== commentBaseline;/);
  assert.match(sectionSource, /const hasRowError = !!asText\(aiRowErrByQid\?\.\[qid\]\);/);
  assert.match(sectionSource, /const rowSyncState = busy\s*\?\s*"syncing"\s*:\s*\(hasRowError \? "error" : \(hasLocalChanges \? "local" : "saved"\)\);/);
});

test("NotesPanel localizes AI question failures by qid and clears stale row errors on edit and retry", () => {
  assert.match(notesPanelSource, /const \[aiRowErrByQid, setAiRowErrByQid\] = useState\(\{\}\);/);
  assert.match(notesPanelSource, /setAiRowErrByQid\(\{\}\);/);
  assert.match(notesPanelSource, /setAiRowErrByQid\(\(prev\) => \{\s*const next = \{ \.\.\.\(prev \|\| \{\}\) \};\s*delete next\[qid\];/);
  assert.match(notesPanelSource, /if \(rr && rr\.ok === false\) \{\s*setAiRowErrByQid\(\(prev\) => \(\{\s*\.\.\.\(prev \|\| \{\}\),\s*\[qid\]: String\(rr\.error \|\| "Не удалось сохранить AI-комментарий\."\),/);
  assert.match(notesPanelSource, /catch \(e\) \{\s*setAiRowErrByQid\(\(prev\) => \(\{\s*\.\.\.\(prev \|\| \{\}\),\s*\[qid\]: String\(e\?\.message \|\| e \|\| "Не удалось сохранить AI-комментарий\."\),/);
});

test("NotesPanel keeps generation error separate and passes row-scoped errors into AIQuestionsSection", () => {
  assert.match(notesPanelSource, /async function requestAiQuestionsGenerate\(\) \{\s*if \(!aiGenerateUi\.canGenerate\) \{\s*setAiErr/);
  assert.match(notesPanelSource, /aiRowErrByQid=\{aiRowErrByQid\}/);
  assert.doesNotMatch(notesPanelSource, /saveElementAiQuestion[\s\S]*setAiErr\("/);
});
