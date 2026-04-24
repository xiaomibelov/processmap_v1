import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const notesMvpPanelSource = fs.readFileSync(new URL("./NotesMvpPanel.jsx", import.meta.url), "utf8");
const badgeSource = fs.readFileSync(new URL("./NotesAggregateBadge.jsx", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const derivedSource = fs.readFileSync(new URL("../features/tldr/ui/DerivedContextSurface.jsx", import.meta.url), "utf8");
const diagramControlsSource = fs.readFileSync(new URL("../features/process/stage/ui/ProcessStageDiagramControls.jsx", import.meta.url), "utf8");
const workspaceExplorerSource = fs.readFileSync(new URL("../features/explorer/WorkspaceExplorer.jsx", import.meta.url), "utf8");

test("Discussions surface uses unified discussions labeling and hides the floating trigger on desktop", () => {
  assert.match(badgeSource, /label = "Заметки"/);
  assert.match(badgeSource, /compactNumericOnly = false/);
  assert.match(badgeSource, /compactNumericOnly \? "pointer-events-none shrink-0" : ""/);
  assert.match(badgeSource, /\{compact && compactNumericOnly \? null : <span>\{chipLabel\}<\/span>\}/);
  assert.match(notesMvpPanelSource, /NotesAggregateBadge aggregate=\{aggregate\} compact compactNumericOnly label="Обсуждения"/);
  assert.match(notesMvpPanelSource, /NotesAggregateBadge aggregate=\{aggregate\} compact compactNumericOnly label="Обсуждения" className="bg-white\/85"/);
  assert.match(notesMvpPanelSource, /className="fixed bottom-5 right-5 z-\[86\] hidden[\s\S]*max-lg:flex lg:hidden"/);
  assert.match(diagramControlsSource, /NotesAggregateBadge[\s\S]*compactNumericOnly[\s\S]*label="Обсуждения"/);
  assert.match(workspaceExplorerSource, /<NotesAggregateBadge aggregate=\{notesAggregate\} compact \/>/);
});

test("Derived context is hidden in the active diagram discussions workflow", () => {
  assert.match(appSource, /const \[notesDiscussionsOpen, setNotesDiscussionsOpen\] = useState\(false\);/);
  assert.match(appSource, /<NotesMvpPanel[\s\S]*onOpenChange=\{setNotesDiscussionsOpen\}/);
  assert.match(appSource, /<DerivedContextSurface[\s\S]*hidden=\{notesDiscussionsOpen \|\| processUiState\?\.tab === "diagram"\}/);
  assert.match(derivedSource, /export default function DerivedContextSurface\(\{[\s\S]*hidden = false,/);
  assert.match(derivedSource, /if \(!hasActiveSession \|\| hidden\) return null;/);
});

test("Legacy bridge copy no longer claims TL;DR is inside the discussions viewport", () => {
  assert.doesNotMatch(notesMvpPanelSource, /История и TL;DR видны здесь/);
  assert.doesNotMatch(notesMvpPanelSource, /TL;DR остаётся видимым выше/);
});

test("Top toolbar keeps discussions as the primary entry and removes conflicting actions", () => {
  assert.match(diagramControlsSource, /const handleOpenNotesDiscussions = \(\) => \{/);
  assert.match(diagramControlsSource, /className=\"bpmnCanvasTools diagramActionBar z-\[92\] pointer-events-auto\"/);
  assert.match(diagramControlsSource, /style=\{\{ zIndex: 92, pointerEvents: "auto" \}\}/);
  assert.match(diagramControlsSource, /className=\"primaryBtn diagramActionBtn relative z-\[1\]\"/);
  assert.match(diagramControlsSource, /data-notes-panel-trigger=\"true\"/);
  assert.doesNotMatch(diagramControlsSource, /data-testid="diagram-action-quality"/);
  assert.match(diagramControlsSource, /data-testid="diagram-action-search"[\s\S]*<svg/);
});

test("Discussions toolbar uses an explicit App to NotesMvpPanel open bridge", () => {
  assert.match(appSource, /const notesPanelRef = useRef\(null\);/);
  assert.match(appSource, /notesPanelRef\.current\?\.openFromExternalRequest\?\.\(request\);/);
  assert.match(appSource, /<NotesMvpPanel[\s\S]*ref=\{notesPanelRef\}/);
  assert.match(notesMvpPanelSource, /const NotesMvpPanel = forwardRef\(function NotesMvpPanel/);
  assert.match(notesMvpPanelSource, /useImperativeHandle\(ref, \(\) => \(\{/);
  assert.match(notesMvpPanelSource, /openFromExternalRequest\(request\) \{/);
  assert.match(notesMvpPanelSource, /applyExternalOpenRequest\(externalOpenRequest\);/);
});
