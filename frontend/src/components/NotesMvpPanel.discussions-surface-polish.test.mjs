import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const notesMvpPanelSource = fs.readFileSync(new URL("./NotesMvpPanel.jsx", import.meta.url), "utf8");
const processStageSource = fs.readFileSync(new URL("./ProcessStage.jsx", import.meta.url), "utf8");
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

test("Process pages do not mount the floating derived context surface", () => {
  assert.match(appSource, /const \[notesDiscussionsOpen, setNotesDiscussionsOpen\] = useState\(false\);/);
  assert.match(appSource, /<NotesMvpPanel[\s\S]*onOpenChange=\{setNotesDiscussionsOpen\}/);
  assert.doesNotMatch(appSource, /import DerivedContextSurface from/);
  assert.doesNotMatch(appSource, /<DerivedContextSurface\b/);
  assert.match(derivedSource, /export default function DerivedContextSurface\(\{/);
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

test("Discussions expose a participated threads filter without changing unread semantics", () => {
  assert.match(notesMvpPanelSource, /isThreadParticipatedByCurrentUser/);
  assert.match(notesMvpPanelSource, /countParticipatedThreads/);
  assert.match(notesMvpPanelSource, /const \[participationFilter, setParticipationFilter\] = useState\("all"\);/);
  assert.match(notesMvpPanelSource, /data-testid="notes-participation-filter-all"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-participation-filter-my"/);
  assert.match(notesMvpPanelSource, /Мои \{participatedThreadsCount\}/);
  assert.match(notesMvpPanelSource, /Темы текущей сессии, где вы создали обсуждение, отвечали или были упомянуты\./);
  assert.match(notesMvpPanelSource, /Пока нет обсуждений с вашим участием\./);
  assert.match(notesMvpPanelSource, /participationFilter === "my" && !isThreadParticipatedByCurrentUser\(thread, viewerUserId\)/);
  assert.match(notesMvpPanelSource, /setParticipationFilter\("all"\);/);
  assert.doesNotMatch(notesMvpPanelSource, /непрочитанные/);
});

test("Discussion unread badges are separate from attention and clear through read state", () => {
  assert.match(notesMvpPanelSource, /apiMarkNoteThreadRead/);
  assert.match(notesMvpPanelSource, /function unreadCount\(thread\)/);
  assert.match(notesMvpPanelSource, /const markReadInFlightRef = useRef\(new Set\(\)\);/);
  assert.match(notesMvpPanelSource, /data-testid="notes-thread-unread-badge"/);
  assert.match(notesMvpPanelSource, /Новые сообщения: \$\{newMessagesCount\}/);
  assert.match(notesMvpPanelSource, /clearThreadUnread\(threadId, result\)/);
  assert.match(notesMvpPanelSource, /unread_count: 0/);
  assert.match(notesMvpPanelSource, /participatedThreadsCount/);
  assert.match(notesMvpPanelSource, /requiresAttention\(thread\)/);
  assert.doesNotMatch(notesMvpPanelSource, /attentionMeta\(thread\)[\s\S]{0,240}unread_count/);
});

test("Discussions support durable replies and raw Markdown message editing", () => {
  assert.match(notesMvpPanelSource, /apiPatchNoteComment/);
  assert.match(notesMvpPanelSource, /const \[replyTargetByThread, setReplyTargetByThread\] = useState\(\{\}\);/);
  assert.match(notesMvpPanelSource, /reply_to_comment_id: text\(replyTarget\?\.id\) \|\| undefined/);
  assert.match(notesMvpPanelSource, /data-testid="notes-reply-preview"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-reply-cancel"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-comment-reply-quote"/);
  assert.match(notesMvpPanelSource, /Исходное сообщение недоступно\./);
  assert.match(notesMvpPanelSource, /data-testid="notes-comment-edit-action"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-comment-edit-textarea"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-comment-edited-marker"/);
  assert.match(notesMvpPanelSource, /<NoteMarkdown>\{comment\?\.body\}<\/NoteMarkdown>/);
  assert.match(notesMvpPanelSource, /mention_user_ids: editMentionUserIds/);
  assert.match(notesMvpPanelSource, /pruneSelectedMentions\(nextValue, current\.selected\)/);
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
  assert.match(notesMvpPanelSource, /function profileIdentityLabel\(\.\.\.values\)/);
  assert.match(notesMvpPanelSource, /function setUserLabel\(out, userId, \.\.\.values\)/);
  assert.match(notesMvpPanelSource, /function authorLabel\(value, userLabels = \{\}, viewerUserId = ""\)/);
  assert.match(notesMvpPanelSource, /if \(isTechnicalId\(raw\)\) return "Пользователь";/);
  assert.doesNotMatch(notesMvpPanelSource, /return `Пользователь \$\{shortTechnicalId\(raw\)\}`;/);
  assert.match(notesMvpPanelSource, /const authorLabelsById = useMemo\(\(\) => \{/);
  assert.match(notesMvpPanelSource, /setUserLabel\(out, thread\?\.created_by, thread\?\.created_by_full_name, thread\?\.created_by_email\);/);
  assert.match(notesMvpPanelSource, /setUserLabel\(out, comment\?\.author_user_id, comment\?\.author_full_name, comment\?\.author_email\);/);
  assert.match(notesMvpPanelSource, /const author = authorLabel\(comment\?\.author_user_id, authorLabelsById, viewerUserId\);/);
  assert.match(notesMvpPanelSource, /Создал \{threadCreatorLabel\(thread, authorLabelsById, viewerUserId\)\}/);
  assert.match(notesMvpPanelSource, /Последний: \{threadLastAuthorLabel\(thread, authorLabelsById, viewerUserId\)\}/);
  assert.match(notesMvpPanelSource, /const mentionLabel = firstMentionLabel\(thread, authorLabelsById, viewerUserId\);/);
  assert.match(notesMvpPanelSource, /authorLabel\(mention\?\.mentioned_user_id, authorLabelsById, viewerUserId\)/);
  assert.doesNotMatch(notesMvpPanelSource, /const author = authorLabel\(comment\?\.author_user_id\);/);
  assert.doesNotMatch(notesMvpPanelSource, /<span>\{text\(ref\.element_id\)\}<\/span>/);
});

test("Element-scoped discussions do not promote BPMN technical ids as element names", () => {
  assert.match(notesMvpPanelSource, /import \{ readableBpmnText \} from "\.\.\/features\/process\/bpmn\/bpmnIdentity"/);
  assert.match(notesMvpPanelSource, /function readableBpmnLabel\(\.\.\.values\)[\s\S]*return readableBpmnText\(\.\.\.values\);/);
  assert.match(notesMvpPanelSource, /element_name: readableBpmnLabel\(selectedElement\?\.name\)/);
  assert.doesNotMatch(notesMvpPanelSource, /element_name: text\(selectedElement\?\.name \|\| selectedId\)/);
  assert.match(notesMvpPanelSource, /long: label \|\| "Элемент BPMN"/);
});

test("Discussions render entity priority and attention from the thread source of truth", () => {
  assert.match(notesMvpPanelSource, /const PRIORITY_OPTIONS = \[/);
  assert.match(notesMvpPanelSource, /function priorityMeta\(thread\)/);
  assert.match(notesMvpPanelSource, /function attentionMeta\(thread\)/);
  assert.match(notesMvpPanelSource, /function attentionAcknowledged\(thread\)/);
  assert.match(notesMvpPanelSource, /data-testid="notes-create-priority"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-create-attention"/);
  assert.match(notesMvpPanelSource, /data-testid=\{`notes-\$\{kind\}-mention-suggestions`\}/);
  assert.match(notesMvpPanelSource, /data-testid=\{`notes-\$\{kind\}-mention-option`\}/);
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
  assert.match(notesMvpPanelSource, />Описание</);
  assert.match(notesMvpPanelSource, /Коротко сформулируйте вопрос/);
  assert.match(notesMvpPanelSource, /Добавьте детали, факты или ожидаемое решение/);
  assert.match(notesMvpPanelSource, /Подсветить как требующее реакции/);
  assert.match(notesMvpPanelSource, /body: details \? `\$\{subject\}\\n\\n\$\{details\}` : subject/);
  assert.match(notesMvpPanelSource, /disabled=\{busy === "create" \|\| !text\(createSubject\) \|\| !canCreateCurrentScope\}/);
});

test("Discussions use inline at-mention autocomplete instead of separate mention selects", () => {
  assert.match(notesMvpPanelSource, /detectMentionQuery/);
  assert.match(notesMvpPanelSource, /filterMentionSuggestions/);
  assert.match(notesMvpPanelSource, /insertMentionText/);
  assert.match(notesMvpPanelSource, /mentionUserIdsForSubmit/);
  assert.match(notesMvpPanelSource, /const \[createMentionComposer, setCreateMentionComposer\] = useState\(\{ selected: \[\], active: null, highlightedIndex: 0 \}\);/);
  assert.match(notesMvpPanelSource, /const \[commentMentionByThread, setCommentMentionByThread\] = useState\(\{\}\);/);
  assert.match(notesMvpPanelSource, /onKeyDown=\{\(event\) => handleMentionKeyDown\(event, createMentionComposer, createMentionSuggestions, setCreateMentionComposer, selectCreateMention\)\}/);
  assert.match(notesMvpPanelSource, /onKeyDown=\{\(event\) => handleMentionKeyDown\(event, commentMentionComposer, commentMentionSuggestions, setCommentComposerForSelected, selectCommentMention\)\}/);
  assert.match(notesMvpPanelSource, /placement === "above" \? "bottom-full mb-1" : "top-full mt-1"/);
  assert.match(notesMvpPanelSource, /renderMentionSuggestions\("reply", commentMentionComposer, commentMentionSuggestions, selectCommentMention, "above"\)/);
  assert.match(notesMvpPanelSource, /mention_user_ids: createMentionUserIds/);
  assert.match(notesMvpPanelSource, /mention_user_ids: commentMentionUserIds/);
  assert.doesNotMatch(notesMvpPanelSource, /data-testid="notes-create-mention-user"/);
  assert.doesNotMatch(notesMvpPanelSource, /data-testid="notes-reply-mention-user"/);
  assert.doesNotMatch(notesMvpPanelSource, />Упомянуть</);
});

test("Discussions render comment bodies through safe Markdown without changing composer primitives", () => {
  assert.match(notesMvpPanelSource, /import NoteMarkdown from "\.\.\/features\/notes\/markdownRenderer\.js";/);
  assert.match(notesMvpPanelSource, /<NoteMarkdown>\{comment\?\.body\}<\/NoteMarkdown>/);
  assert.match(notesMvpPanelSource, /data-testid="notes-comment-mentions"/);
  assert.match(notesMvpPanelSource, /Поддерживается Markdown/);
  assert.doesNotMatch(notesMvpPanelSource, /dangerouslySetInnerHTML/);
});

test("Discussion create and reply composers expose a Markdown source toolbar without changing mention flow", () => {
  assert.match(notesMvpPanelSource, /import MarkdownComposerToolbar from "\.\.\/features\/notes\/MarkdownComposerToolbar\.jsx";/);
  assert.match(notesMvpPanelSource, /import \{ applyMarkdownAction \} from "\.\.\/features\/notes\/markdownComposerActions\.js";/);
  assert.match(notesMvpPanelSource, /function applyComposerMarkdownAction\(kind, action\)/);
  assert.match(notesMvpPanelSource, /applyMarkdownAction\(createDetails, selectionStart, selectionEnd, action\)/);
  assert.match(notesMvpPanelSource, /updateCreateDetails\(result\.text, result\.selectionEnd\)/);
  assert.match(notesMvpPanelSource, /applyMarkdownAction\(commentDraft, selectionStart, selectionEnd, action\)/);
  assert.match(notesMvpPanelSource, /updateCommentDraft\(threadId, result\.text, result\.selectionEnd\)/);
  assert.match(notesMvpPanelSource, /testId="notes-create-markdown-toolbar"/);
  assert.match(notesMvpPanelSource, /testId="notes-reply-markdown-toolbar"/);
  assert.match(notesMvpPanelSource, /renderMentionSuggestions\("create", createMentionComposer, createMentionSuggestions, selectCreateMention\)/);
  assert.match(notesMvpPanelSource, /renderMentionSuggestions\("reply", commentMentionComposer, commentMentionSuggestions, selectCommentMention, "above"\)/);
  assert.match(notesMvpPanelSource, /mention_user_ids: createMentionUserIds/);
  assert.match(notesMvpPanelSource, /mention_user_ids: commentMentionUserIds/);
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

test("Element-scoped discussion exposes a linked element focus action through App and ProcessStage", () => {
  assert.match(notesMvpPanelSource, /function linkedElementContext\(thread\)/);
  assert.match(notesMvpPanelSource, /text\(thread\?\.scope_type\) !== "diagram_element"/);
  assert.match(notesMvpPanelSource, /data-testid="notes-thread-focus-linked-element"/);
  assert.match(notesMvpPanelSource, />\s*Перейти к элементу\s*<\/button>/);
  assert.match(notesMvpPanelSource, /\[DISCUSSION_FOCUS_DIAG\]/);
  assert.match(notesMvpPanelSource, /onFocusLinkedElement\?\.\(\{/);
  assert.match(notesMvpPanelSource, /Элемент больше не найден на схеме\./);
  assert.match(notesMvpPanelSource, /result !== true && result\?\.ok !== true/);
  assert.match(notesMvpPanelSource, /async function focusSelectedThreadLinkedElement\(\)[\s\S]*setOpen\(false\);\s*setCreateOpen\(false\);/);
  assert.match(appSource, /const \[discussionLinkedElementFocusIntent, setDiscussionLinkedElementFocusIntent\] = useState\(null\);/);
  assert.match(appSource, /discussionLinkedElementFocusResolversRef = useRef\(new Map\(\)\)/);
  assert.match(appSource, /function completeDiscussionLinkedElementFocus\(result = \{\}\)/);
  assert.match(appSource, /\[DISCUSSION_FOCUS_DIAG\]/);
  assert.match(appSource, /new Promise\(\(resolve\) => \{/);
  assert.match(appSource, /requestId,\s*elementId: targetId/);
  assert.match(appSource, /function focusDiscussionElementTarget\(payload = \{\}, source = "discussion_linked_element"\)/);
  assert.match(appSource, /setDiscussionLinkedElementFocusIntent\(\{/);
  assert.match(appSource, /discussionLinkedElementFocusIntent=\{discussionLinkedElementFocusIntent\}/);
  assert.match(appSource, /onDiscussionLinkedElementFocusResult=\{completeDiscussionLinkedElementFocus\}/);
  assert.match(appSource, /onFocusLinkedElement=\{focusDiscussionLinkedElement\}/);
  assert.match(processStageSource, /discussionLinkedElementFocusIntent = null/);
  assert.match(processStageSource, /onDiscussionLinkedElementFocusResult = null/);
  assert.match(processStageSource, /\[DISCUSSION_FOCUS_DIAG\]/);
  assert.match(processStageSource, /stage-runtime-ready/);
  assert.match(processStageSource, /stage-select/);
  assert.match(processStageSource, /stage-focus/);
  assert.match(processStageSource, /stage-flash/);
  assert.match(processStageSource, /if \(tab !== "diagram"\) \{[\s\S]*stage-switch-to-diagram[\s\S]*setTab\("diagram"\);[\s\S]*return;[\s\S]*\}/);
  assert.match(processStageSource, /onDiscussionLinkedElementFocusResult\?\.\(\{/);
  assert.match(processStageSource, /complete\(false, "missing_element"\)/);
  assert.match(processStageSource, /complete\(false, "focus_failed"\)/);
  assert.match(processStageSource, /complete\(true\)/);
  assert.match(processStageSource, /bpmnRef\.current\?\.selectElements\?\.\(\[elementId\]/);
  assert.match(processStageSource, /const focused = bpmnRef\.current\?\.focusNode\?\.\(elementId/);
  assert.match(processStageSource, /bpmnRef\.current\?\.flashNode\?\.\(elementId, "accent"/);
  assert.match(processStageSource, /setGenErr\("Элемент больше не найден на схеме\."\)/);
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
