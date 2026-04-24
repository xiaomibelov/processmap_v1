import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const notesMvpPanelSource = fs.readFileSync(new URL("./NotesMvpPanel.jsx", import.meta.url), "utf8");
const badgeSource = fs.readFileSync(new URL("./NotesAggregateBadge.jsx", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const derivedSource = fs.readFileSync(new URL("../features/tldr/ui/DerivedContextSurface.jsx", import.meta.url), "utf8");
const diagramControlsSource = fs.readFileSync(new URL("../features/process/stage/ui/ProcessStageDiagramControls.jsx", import.meta.url), "utf8");

test("Discussions surface uses unified discussions labeling and hides the floating trigger on desktop", () => {
  assert.match(badgeSource, /label = "Заметки"/);
  assert.match(notesMvpPanelSource, /NotesAggregateBadge aggregate=\{aggregate\} compact label="Обсуждения"/);
  assert.match(notesMvpPanelSource, /NotesAggregateBadge aggregate=\{aggregate\} label="Обсуждения"/);
  assert.match(notesMvpPanelSource, /className="fixed bottom-5 right-5 z-\[86\] hidden[\s\S]*max-lg:flex lg:hidden"/);
  assert.match(diagramControlsSource, /NotesAggregateBadge[\s\S]*label="Обсуждения"/);
});

test("Derived context is hidden while the discussions panel is open", () => {
  assert.match(appSource, /const \[notesDiscussionsOpen, setNotesDiscussionsOpen\] = useState\(false\);/);
  assert.match(appSource, /<NotesMvpPanel[\s\S]*onOpenChange=\{setNotesDiscussionsOpen\}/);
  assert.match(appSource, /<DerivedContextSurface[\s\S]*hidden=\{notesDiscussionsOpen\}/);
  assert.match(derivedSource, /export default function DerivedContextSurface\(\{[\s\S]*hidden = false,/);
  assert.match(derivedSource, /if \(!hasActiveSession \|\| hidden\) return null;/);
});

test("Legacy bridge copy no longer claims TL;DR is inside the discussions viewport", () => {
  assert.doesNotMatch(notesMvpPanelSource, /История и TL;DR видны здесь/);
  assert.doesNotMatch(notesMvpPanelSource, /TL;DR остаётся видимым выше/);
});
