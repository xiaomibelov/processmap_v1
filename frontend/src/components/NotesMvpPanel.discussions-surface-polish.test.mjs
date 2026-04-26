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
  assert.match(notesMvpPanelSource, /data-testid="notes-panel-floating-trigger"/);
  assert.match(notesMvpPanelSource, /className="fixed bottom-5 right-5 z-\[86\] hidden[\s\S]*max-lg:flex lg:hidden"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-summary-line"/);
  assert.doesNotMatch(notesMvpPanelSource, /text-lg font-black text-fg">Обсуждения</);
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

test("Discussions sidebar collapses heavy labels into a compact filters control", () => {
  assert.match(notesMvpPanelSource, /data-testid="notes-sidebar-search"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-filters-toggle"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-filters-panel"/);
  assert.doesNotMatch(notesMvpPanelSource, /Навигация по обсуждениям/);
  assert.doesNotMatch(notesMvpPanelSource, /text-\[10px\] font-semibold uppercase tracking-\[0\.08em\] text-muted">Статус<\/span>/);
  assert.doesNotMatch(notesMvpPanelSource, /text-\[10px\] font-semibold uppercase tracking-\[0\.08em\] text-muted">Контекст<\/span>/);
  assert.doesNotMatch(notesMvpPanelSource, /text-\[10px\] font-semibold uppercase tracking-\[0\.08em\] text-muted">Порядок<\/span>/);
});

test("Top toolbar keeps discussions as the primary entry and removes conflicting actions", () => {
  assert.match(diagramControlsSource, /const handleOpenNotesDiscussions = \(\) => \{/);
  assert.match(diagramControlsSource, /function clickNotesPanelFloatingTrigger\(\) \{/);
  assert.match(diagramControlsSource, /const explicitOpenNotesDiscussions = typeof topbarSection\.openNotesDiscussions === "function"/);
  assert.match(diagramControlsSource, /const latestOpenNotesDiscussionsRef = useRef\(null\);/);
  assert.match(diagramControlsSource, /latestOpenNotesDiscussionsRef\.current = explicitOpenNotesDiscussions/);
  assert.match(diagramControlsSource, /\|\| \(typeof legacyView\.openNotesDiscussions === "function" \? legacyView\.openNotesDiscussions : null\)/);
  assert.match(diagramControlsSource, /const openedFromBridge = latestOpenNotesDiscussionsRef\.current\?\.\(\) === true;/);
  assert.match(diagramControlsSource, /clickNotesPanelFloatingTrigger\(\);/);
  assert.match(diagramControlsSource, /className=\"bpmnCanvasTools diagramActionBar z-\[92\] pointer-events-auto\"/);
  assert.match(diagramControlsSource, /style=\{\{ zIndex: 92, pointerEvents: "auto" \}\}/);
  assert.match(diagramControlsSource, /className=\"primaryBtn diagramActionBtn relative z-\[1\]\"/);
  assert.match(diagramControlsSource, /data-notes-panel-trigger=\"true\"/);
  assert.doesNotMatch(diagramControlsSource, /data-testid="diagram-action-quality"/);
  assert.match(diagramControlsSource, /data-testid="diagram-action-search"[\s\S]*<svg/);
});

test("Discussions toolbar uses an explicit App to NotesMvpPanel open bridge", () => {
  assert.match(appSource, /const notesPanelRef = useRef\(null\);/);
  assert.match(appSource, /const openedFromRef = notesPanelRef\.current\?\.openFromExternalRequest\?\.\(request\) === true;/);
  assert.match(appSource, /return openedFromRef;/);
  assert.match(appSource, /<NotesMvpPanel[\s\S]*ref=\{notesPanelRef\}/);
  assert.match(notesMvpPanelSource, /const NotesMvpPanel = forwardRef\(function NotesMvpPanel/);
  assert.match(notesMvpPanelSource, /useImperativeHandle\(ref, \(\) => \(\{/);
  assert.match(notesMvpPanelSource, /openFromExternalRequest\(request\) \{/);
  assert.match(notesMvpPanelSource, /applyExternalOpenRequest\(externalOpenRequest\);/);
});

test("Current discussion header uses a denser metadata line instead of technical labels", () => {
  assert.match(notesMvpPanelSource, /data-testid="notes-thread-header-meta"/);
  assert.doesNotMatch(notesMvpPanelSource, /Относится к:/);
  assert.doesNotMatch(notesMvpPanelSource, /Последняя активность:/);
  assert.doesNotMatch(notesMvpPanelSource, /Сообщений:/);
});

test("Selected discussion messages start below the header without bottom-justified dead space", () => {
  assert.match(notesMvpPanelSource, /data-testid="notes-thread-message-scroll"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-thread-message-flow"/);
  assert.doesNotMatch(notesMvpPanelSource, /flex min-h-full flex-col justify-end gap-3/);
  assert.match(notesMvpPanelSource, /className="flex flex-col gap-2\.5"/);
  assert.match(notesMvpPanelSource, /className="rounded-xl border border-border bg-panel px-3 py-2\.5 shadow-sm"/);
  assert.match(notesMvpPanelSource, /className="grid h-8 w-8 shrink-0/);
  assert.match(notesMvpPanelSource, /className="textarea min-h-\[84px\] w-full text-sm"/);
});
