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
  assert.match(badgeSource, /label = "Обсуждения"/);
  assert.match(badgeSource, /Открытые \$\{chipLabel\.toLowerCase\(\)\}: \$\{openCount\}/);
  assert.doesNotMatch(badgeSource, /data-attention-discussions/);
  assert.doesNotMatch(badgeSource, /attention_discussions_count/);
  assert.match(badgeSource, /compactNumericOnly = false/);
  assert.match(badgeSource, /compactNumericOnly \? "pointer-events-none shrink-0" : ""/);
  assert.match(badgeSource, /\{compact && compactNumericOnly \? null : <span>\{chipLabel\}<\/span>\}/);
  assert.match(notesMvpPanelSource, /NotesAggregateBadge aggregate=\{aggregate\} compact compactNumericOnly label="Обсуждения"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-panel-floating-trigger"/);
  assert.match(notesMvpPanelSource, /className="fixed bottom-5 right-5 z-\[86\] hidden[\s\S]*max-lg:flex lg:hidden"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-summary-line"/);
  assert.doesNotMatch(notesMvpPanelSource, /text-lg font-black text-fg">Обсуждения</);
  assert.match(diagramControlsSource, /NotesAggregateBadge[\s\S]*compactNumericOnly[\s\S]*label="Обсуждения"/);
  assert.doesNotMatch(workspaceExplorerSource, /<NotesAggregateBadge aggregate=\{notesAggregate\} compact \/>/);
  assert.match(workspaceExplorerSource, /showDiscussionColumn: true/);
  assert.match(workspaceExplorerSource, /aria-label="Колонка открытых обсуждений"/);
  assert.match(workspaceExplorerSource, /title="Открытые обсуждения"/);
  assert.match(workspaceExplorerSource, /NotesAggregateBadge[\s\S]*aggregate=\{notesAggregate\}[\s\S]*compactNumericOnly[\s\S]*label="Обсуждения"/);
  assert.match(workspaceExplorerSource, /<th className="px-2 py-2 text-center"[\s\S]*Обс\.[\s\S]*<\/th>/);
  assert.match(workspaceExplorerSource, /aria-label="Колонка Требует внимания"[\s\S]*⚠[\s\S]*Вним\./);
  assert.match(workspaceExplorerSource, /sessionDiscussionAttentionCount\(notesAggregate\)/);
  assert.match(workspaceExplorerSource, /attention_discussions_count/);
  assert.match(workspaceExplorerSource, /<MetricCell label=\{rowAttentionLabel\} value=\{rowAttentionCount\} warn icon="⚠" emptyLabel="—" \/>/);
  assert.match(workspaceExplorerSource, /sessionColumnProfile\.showSignalColumns \? <col className="w-\[76px\]" \/> : null/);
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
  assert.match(notesMvpPanelSource, /Создал \{threadCreatorLabel\(selectedThread, authorLabelsById, viewerUserId\)\}/);
  assert.match(notesMvpPanelSource, /последний ответ \{threadLastAuthorLabel\(selectedThread, authorLabelsById, viewerUserId\)\}/);
  assert.match(notesMvpPanelSource, /адресат \{firstMentionLabel\(selectedThread, authorLabelsById, viewerUserId\)\}/);
  assert.doesNotMatch(notesMvpPanelSource, /Относится к:/);
  assert.doesNotMatch(notesMvpPanelSource, /Последняя активность:/);
  assert.doesNotMatch(notesMvpPanelSource, /Сообщений:/);
});

test("Discussion cards and messages render authorship without promoting raw technical IDs", () => {
  assert.match(notesMvpPanelSource, /function isTechnicalId\(value\)/);
  assert.match(notesMvpPanelSource, /function shortTechnicalId\(value\)/);
  assert.match(notesMvpPanelSource, /function authorLabel\(value, userLabels = \{\}, viewerUserId = ""\)/);
  assert.match(notesMvpPanelSource, /return `Пользователь \$\{shortTechnicalId\(raw\)\}`;/);
  assert.match(notesMvpPanelSource, /const authorLabelsById = useMemo\(\(\) => \{/);
  assert.match(notesMvpPanelSource, /if \(viewerUserId\) out\[viewerUserId\] = "Вы";/);
  assert.match(notesMvpPanelSource, /const author = authorLabel\(comment\?\.author_user_id, authorLabelsById, viewerUserId\);/);
  assert.match(notesMvpPanelSource, /Создал \{threadCreatorLabel\(thread, authorLabelsById, viewerUserId\)\}/);
  assert.match(notesMvpPanelSource, /Последний: \{threadLastAuthorLabel\(thread, authorLabelsById, viewerUserId\)\}/);
  assert.match(notesMvpPanelSource, /const mentionLabel = firstMentionLabel\(thread, authorLabelsById, viewerUserId\);/);
  assert.doesNotMatch(notesMvpPanelSource, /const author = authorLabel\(comment\?\.author_user_id\);/);
  assert.doesNotMatch(notesMvpPanelSource, /<span>\{text\(ref\.element_id\)\}<\/span>/);
});

test("Discussions render entity priority and attention from the thread source of truth", () => {
  assert.match(notesMvpPanelSource, /const PRIORITY_OPTIONS = \[/);
  assert.match(notesMvpPanelSource, /function priorityMeta\(thread\)/);
  assert.match(notesMvpPanelSource, /function attentionMeta\(thread\)/);
  assert.match(notesMvpPanelSource, /function attentionAcknowledged\(thread\)/);
  assert.match(notesMvpPanelSource, /data-testid="notes-create-priority"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-create-attention"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-create-mention-user"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-reply-mention-user"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-comment-mentions"/);
  assert.match(notesMvpPanelSource, /apiListMentionableUsers/);
  assert.match(notesMvpPanelSource, /mention_user_ids/);
  assert.match(notesMvpPanelSource, /processmap:note-mentions-changed/);
  assert.match(notesMvpPanelSource, /data-testid="notes-thread-priority-select"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-thread-attention-toggle"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-thread-attention-acknowledge"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-thread-attention-acknowledged"/);
  assert.match(notesMvpPanelSource, /apiAcknowledgeNoteThreadAttention/);
  assert.match(notesMvpPanelSource, /attention_acknowledged_by_me/);
  assert.match(notesMvpPanelSource, /priority: createPriority/);
  assert.match(notesMvpPanelSource, /requires_attention: createRequiresAttention/);
  assert.match(notesMvpPanelSource, /patchThreadMeta\(\{ priority: event\.target\.value \}\)/);
  assert.match(notesMvpPanelSource, /patchThreadMeta\(\{ requires_attention: !requiresAttention\(selectedThread\) \}\)/);
});

test("Create discussion flow presents an entity-style form and composes initial message from subject and details", () => {
  assert.match(notesMvpPanelSource, /const \[createSubjectByScope, setCreateSubjectByScope\] = useState/);
  assert.match(notesMvpPanelSource, /const \[createDetailsByScope, setCreateDetailsByScope\] = useState/);
  assert.match(notesMvpPanelSource, /data-testid="notes-create-subject"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-create-context"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-create-details"/);
  assert.match(notesMvpPanelSource, />Суть вопроса</);
  assert.match(notesMvpPanelSource, />Контекст</);
  assert.match(notesMvpPanelSource, />Приоритет</);
  assert.match(notesMvpPanelSource, />Требует внимания</);
  assert.match(notesMvpPanelSource, />Упомянуть</);
  assert.match(notesMvpPanelSource, />Описание</);
  assert.match(notesMvpPanelSource, /Коротко сформулируйте вопрос/);
  assert.match(notesMvpPanelSource, /Добавьте детали, факты или ожидаемое решение/);
  assert.match(notesMvpPanelSource, /Без упоминания/);
  assert.match(notesMvpPanelSource, /Подсветить как требующее реакции/);
  assert.match(notesMvpPanelSource, /body: details \? `\$\{subject\}\\n\\n\$\{details\}` : subject/);
  assert.match(notesMvpPanelSource, /disabled=\{busy === "create" \|\| !text\(createSubject\) \|\| !canCreateCurrentScope\}/);
});

test("Discussions panel exposes bounded notification inbox and history without new storage truth", () => {
  assert.match(notesMvpPanelSource, /buildDiscussionNotificationBuckets\(threads, \{ currentUserId: viewerUserId \}\)/);
  assert.match(notesMvpPanelSource, /const \[panelMode, setPanelMode\] = useState\("discussions"\);/);
  assert.match(notesMvpPanelSource, /const notificationMode = panelMode === "notifications";/);
  assert.match(notesMvpPanelSource, /data-testid="discussion-notification-inbox"/);
  assert.match(notesMvpPanelSource, /notificationBuckets\.active/);
  assert.match(notesMvpPanelSource, /notificationBuckets\.history/);
  assert.match(notesMvpPanelSource, /Требует внимания/);
  assert.match(notesMvpPanelSource, /Требуют внимания/);
  assert.match(notesMvpPanelSource, /Недавние/);
  assert.match(notesMvpPanelSource, /\{notificationMode \? \(/);
  assert.match(notesMvpPanelSource, /\) : \(\s*<>\s*<div className="flex items-center gap-2">/);
  assert.match(notesMvpPanelSource, /apiAcknowledgeNoteThreadAttention\(threadId\)/);
  assert.match(notesMvpPanelSource, /onFocusNotificationTarget\?\.\(/);
  assert.match(notesMvpPanelSource, /data-note-comment-id=\{commentId \|\| undefined\}/);
  assert.doesNotMatch(notesMvpPanelSource, /Discussion inbox|Inbox\/history/);
  assert.doesNotMatch(notesMvpPanelSource, /notification_subscribers|watcher_model|external_delivery/);
});

test("Selected discussion messages start below the header without bottom-justified dead space", () => {
  assert.match(notesMvpPanelSource, /data-testid="notes-thread-message-scroll"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-thread-message-flow"/);
  assert.doesNotMatch(notesMvpPanelSource, /flex min-h-full flex-col justify-end gap-3/);
  assert.match(notesMvpPanelSource, /className="flex flex-col gap-2\.5"/);
  assert.match(notesMvpPanelSource, /className=\{`rounded-xl border bg-panel px-3 py-2\.5 shadow-sm/);
  assert.match(notesMvpPanelSource, /className="grid h-8 w-8 shrink-0/);
  assert.match(notesMvpPanelSource, /className="textarea min-h-\[84px\] w-full text-sm"/);
});
