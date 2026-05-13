import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "ProductActionsPanel.jsx"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../../../styles/tailwind.css"), "utf8");

test("ProductActionsPanel exposes MVP product action fields in Analysis UI", () => {
  [
    "Действия с продуктом",
    "Сохранено:",
    "По выбранному шагу",
    "Все действия",
    "Товар",
    "Группа товара",
    "Тип действия",
    "Этап",
    "Объект",
    "Категория объекта",
    "Способ",
    "Сохранить действие",
  ].forEach((label) => {
    assert.equal(source.includes(label), true, `missing label: ${label}`);
  });
});

test("ProductActionsPanel uses explicit analysis persistence and does not call generic Interview autosave", () => {
  assert.equal(source.includes("saveProductActionForStep"), true);
  assert.equal(source.includes("deleteProductActionForStep"), true);
  assert.equal(source.includes("useInterviewSyncLifecycle"), false);
  assert.equal(source.includes("patchStep("), false);
  assert.equal(source.includes("onChange("), false);
});

test("ProductActionsPanel preserves draft during rerenders and blocks empty save", () => {
  assert.equal(source.includes("lastDraftResetKeyRef"), true);
  assert.equal(source.includes("draftResetKey"), true);
  assert.match(
    source,
    /if \(lastDraftResetKeyRef\.current === draftResetKey\) return;/,
    "draft reset must be guarded by stable step/action key",
  );
  assert.equal(source.includes("hasMeaningfulProductActionDraft"), true);
  assert.equal(source.includes("disabled={saving || !canSaveDraft}"), true);
  assert.equal(source.includes("Заполните хотя бы одно поле действия с продуктом."), true);
});

test("ProductActionsPanel makes saved actions primary and keeps editor collapsed", () => {
  assert.equal(source.includes('data-testid="product-actions-list"'), true);
  assert.equal(source.includes('data-testid="product-action-card"'), true);
  assert.equal(source.includes("productActionCard"), true);
  assert.equal(source.includes("productActionCardDetails"), true);
  assert.equal(source.includes("Поля действия"), true);
  assert.equal(source.includes("productActionsScopeToggle"), true);
  assert.equal(source.includes("visibleActions"), true);
  assert.equal(source.includes("Действие другого шага"), true);
  assert.equal(source.includes("Неполное действие"), true);
  assert.equal(source.includes("Неполное"), true);
  assert.equal(source.includes("Редактировать"), true);
  assert.equal(source.includes("editorOpen"), true);
  assert.equal(source.includes('{!editorOpen ? null : ('), true);
  assert.equal(source.includes('data-testid="product-actions-editor"'), true);
  assert.equal(source.includes("Новое действие с продуктом"), true);
  assert.equal(source.includes("Редактирование действия"), true);
});

test("ProductActionsPanel exposes all saved actions without rebinding other-step rows", () => {
  assert.equal(source.includes('const [actionsScope, setActionsScope] = useState("step")'), true);
  assert.equal(source.includes('actionsScope === "all" ? productActions : actionsForStep'), true);
  assert.equal(source.includes("actionMatchesBinding(row, selectedBinding)"), true);
  assert.match(source, /isCurrentStepAction \? \([\s\S]*Редактировать[\s\S]*\) : \(/);
  assert.equal(source.includes("Действие другого шага"), true);
});

test("ProductActionsPanel opens registry through page navigation callback, not modal state", () => {
  assert.equal(source.includes("onOpenProductActionsRegistry = null"), true);
  assert.equal(source.includes('data-testid="product-actions-open-registry"'), true);
  assert.equal(source.includes('scope: "session"'), true);
  assert.equal(source.includes("ProductActionsRegistryPanel"), false);
  assert.equal(source.includes("registryOpen"), false);
});

test("ProductActionsPanel exposes AI suggestion review without legacy notes or generic autosave", () => {
  assert.equal(source.includes("apiSuggestProductActions"), true);
  assert.equal(source.includes("acceptAiProductActions"), true);
  assert.equal(source.includes("AI для шага"), true);
  assert.equal(source.includes("AI-предложения действий"), true);
  assert.equal(source.includes("Принять выбранные"), true);
  assert.equal(source.includes('data-testid="product-actions-ai-review"'), true);
  assert.equal(source.includes('data-testid="product-actions-ai-suggestion"'), true);
  assert.equal(source.includes('data-testid="product-actions-ai-accept"'), true);
  assert.equal(source.includes("duplicate_of"), true);
  assert.equal(source.includes("disabled={duplicate}"), true);
  assert.equal(source.includes("apiPostNote"), false);
  assert.equal(source.includes("apiApplyNotesExtraction"), false);
  assert.equal(source.includes("useInterviewSyncLifecycle"), false);
  assert.match(source, /disabled=\{!canAcceptAiRows\}/);
});

test("ProductActionsPanel batch AI uses one backend batch request instead of per-step suggest loop", () => {
  const batchBlock = source.slice(
    source.indexOf("async function handleBatchSuggestAiProductActions"),
    source.indexOf("function toggleBatchRow"),
  );
  assert.equal(batchBlock.includes("apiBatchSuggestProductActions"), true);
  assert.equal(batchBlock.includes("apiSuggestProductActions("), false);
  assert.equal(batchBlock.includes("apiSaveBatchDraft("), false);
  assert.equal(batchBlock.includes("max_steps_per_chunk: 10"), true);
  assert.equal(batchBlock.includes("skip_existing_actions"), true);
  assert.equal(batchBlock.includes("skip_existing_drafts: true"), true);
  assert.equal(batchBlock.includes("setBatchReviewVisible(true)"), true);
});

test("ProductActionsPanel batch review layout avoids narrow-panel scroll and header collapse", () => {
  const batchReviewCss = styles.match(/\.productActionsBatchReview\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.equal(source.includes("productActionsBatchReviewActions"), true);
  assert.equal(source.includes("productActionsBatchStepName"), true);
  assert.match(batchReviewCss, /min-width: 0;/);
  assert.match(batchReviewCss, /max-width: 100%;/);
  assert.match(batchReviewCss, /overflow: visible;/);
  assert.doesNotMatch(batchReviewCss, /overflow-y: auto;/);
  assert.match(styles, /\.productActionsBatchReview \.productActionsAiReviewHead\s*\{[\s\S]*flex-wrap: wrap;/);
  assert.match(styles, /\.productActionsBatchReviewActions\s*\{[\s\S]*flex-wrap: wrap;/);
  assert.match(styles, /\.productActionsBatchStepSummary\s*\{[\s\S]*flex-wrap: wrap;/);
  assert.match(styles, /\.productActionsAiCard\s*\{[\s\S]*max-width: 100%;/);
  assert.match(styles, /\.productActionsAiChip\s*\{[\s\S]*overflow-wrap: anywhere;/);
});

test("ProductActionsPanel filters single-step AI rows and drops stale responses before apply", () => {
  assert.equal(source.includes("filterSuggestionDraftRowsForStep"), true);
  assert.equal(source.includes("suggestionMatchesSelectedStep"), true);
  assert.equal(source.includes("selectedStepIdRef.current !== requestStepId"), true);
  assert.equal(source.includes("selected_step_id: requestStepId"), true);
  assert.equal(source.includes("selected_step_bpmn_id: requestStepBpmnId"), true);
  assert.equal(source.includes("filterSuggestionDraftRowsForStep(draftResult.suggestions, requestStep)"), true);
  const suggestBlock = source.slice(
    source.indexOf("async function handleSuggestAiProductActions"),
    source.indexOf("function patchAiRow"),
  );
  assert.equal(/acceptAiProductActions|saveProductActionForStep|deleteProductActionForStep|patchInterviewAnalysis/.test(suggestBlock), false);
});

test("ProductActionsPanel maps controlled AI setup errors to admin-facing copy", () => {
  assert.equal(source.includes("AI_PROVIDER_NOT_CONFIGURED"), true);
  assert.equal(source.includes("AI_PROMPT_NOT_CONFIGURED"), true);
  assert.equal(source.includes("AI_PROVIDER_ERROR"), true);
  assert.equal(source.includes("AI_RESPONSE_PARSE_ERROR"), true);
  assert.equal(
    source.includes("AI вернул некорректный формат ответа. Повторите запрос или проверьте prompt модуля в Admin → AI модули."),
    true,
  );
  assert.equal(source.includes("ai_rate_limit_exceeded"), true);
  assert.equal(source.includes("Слишком много AI-запросов"), true);
  assert.equal(source.includes("result?.draft?.message"), true);
  assert.equal(source.includes("Admin → AI модули"), true);
});

test("ProductActionsPanel renders step-based AI progress with success and error stages", () => {
  [
    "Подготавливаем процесс",
    "Проверяем настройки AI",
    "Отправляем запрос в AI",
    "Получаем ответ",
    "Разбираем ответ",
    "Формируем предложения",
    "Готово к проверке",
  ].forEach((label) => {
    assert.equal(source.includes(label), true, `missing progress stage: ${label}`);
  });
  assert.equal(source.includes("AI_PROGRESS_STAGES"), true);
  assert.equal(source.includes("aiProgressStep"), true);
  assert.equal(source.includes("aiProgressErrorStage"), true);
  assert.equal(source.includes('data-testid="product-actions-ai-progress"'), true);
  assert.equal(source.includes('data-testid="product-actions-ai-progress-percent"'), true);
  assert.equal(source.includes('data-testid="product-actions-ai-progress-current"'), true);
  assert.equal(source.includes('data-testid="product-actions-ai-progress-steps"'), true);
  assert.equal(source.includes('data-testid="product-actions-ai-progress-error"'), true);
  assert.equal(source.includes("Найдено ${rows.length} предложений. Проверьте и примите нужные."), true);
  assert.equal(source.includes("setAiProgress(null)"), true);
});

test("ProductActionsPanel keeps AI error state in the progress panel only", () => {
  const parseErrorCopy = "AI вернул некорректный формат ответа. Повторите запрос или проверьте prompt модуля в Admin → AI модули.";
  assert.equal(source.split(parseErrorCopy).length - 1, 1);
  assert.equal(source.includes("aiProgressBadge"), true);
  assert.equal(source.includes('progressRaw?.status === "error" ? "Ошибка"'), true);
  assert.equal(source.includes("aiProgressBarPercent"), true);
  // P0 fix: aiStatus is now always shown when set (no longer suppressed when aiProgress.status === "error")
  assert.equal(source.includes('aiStatus && aiProgress?.status !== "error"'), false);
  assert.equal(source.includes("{aiStatus ? ("), true);
  assert.equal(source.includes(") : aiProgress?.active ? null : ("), true);
});

test("ProductActionsPanel aiProgressStep sets active:false on success so review panel is not hidden (Fix 4)", () => {
  // active must be false when status === "success" so progress panel unmounts and AI review is visible
  assert.match(
    source,
    /active: status !== "success"/,
    "aiProgressStep must set active: status !== 'success' to hide progress panel on success",
  );
  // Confirm the progress panel render gate uses aiProgress?.active
  assert.equal(source.includes("{aiProgress?.active ? ("), true);
  // Confirm the AI review gate uses aiDraft
  assert.equal(source.includes("{aiDraft ? ("), true);
});

test("ProductActionsPanel maps AI progress failures to the stage where they happened", () => {
  assert.match(source, /AI_PROVIDER_NOT_CONFIGURED[\s\S]*AI_PROGRESS_BY_ID\.settings/);
  assert.match(source, /AI_PROMPT_NOT_CONFIGURED[\s\S]*AI_PROMPT_PROGRESS_STAGE/);
  assert.match(source, /AI_PROVIDER_ERROR[\s\S]*AI_PROVIDER_REQUEST_STAGE/);
  assert.match(source, /AI_RESPONSE_PARSE_ERROR[\s\S]*AI_PROGRESS_BY_ID\.parse/);
  assert.match(source, /ai_rate_limit_exceeded[\s\S]*AI_PROGRESS_BY_ID\.settings/);
  assert.equal(source.includes('label: "Проверяем prompt"'), true);
  assert.equal(source.includes('label: "Запрос к AI"'), true);
  assert.equal(source.includes("Ошибка на этапе"), true);
});

test("ProductActionsPanel keeps AI accept on patchInterviewAnalysis path only", () => {
  assert.equal(source.includes("handleAcceptAiRows"), true);
  assert.equal(source.includes("acceptAiProductActions({"), true);
  assert.equal(source.includes("currentAnalysis: interviewData?.analysis"), true);
  assert.equal(source.includes("selectedActions: selectedAiRows"), true);
  assert.equal(source.includes("disabled={!canAcceptAiRows}"), true);
  assert.equal(source.includes("Изменения применены к процессу"), true);
  assert.equal(source.includes("Неполное"), true);
});

test("ProductActionsPanel editor is grouped and has one cancel action in the footer", () => {
  assert.equal(source.includes("FIELD_GROUPS"), true);
  assert.equal(source.includes("Продукт"), true);
  assert.equal(source.includes("Классификация действия"), true);
  assert.equal(source.includes("Контекст выполнения"), true);
  assert.equal(source.includes("productActionsEditorGroup"), true);
  assert.equal(source.includes("productActionsEditorContext"), true);
  const cancelMatches = source.match(/>\s*Отменить\s*</g) || [];
  assert.equal(cancelMatches.length, 1);
});

test("ProductActionsPanel shows selected step context and binding metadata", () => {
  assert.equal(source.includes("showStepContext = true"), true);
  assert.equal(source.includes('data-testid="product-actions-step-context"'), true);
  assert.equal(source.includes("Действий по шагу"), true);
  assert.equal(source.includes("BPMN:"), true);
  assert.equal(source.includes("Роль:"), true);
  assert.equal(source.includes("ID шага:"), true);
});

test("ProductActionsPanel can render embedded in the B-block companion column", () => {
  assert.equal(source.includes("compact = false"), true);
  assert.equal(source.includes('productActionsPanel${compact ? " compact" : ""}'), true);
  assert.equal(source.includes("{showStepContext ? ("), true);
});

test("ProductActionsPanel stays visible with a useful empty state when there are no steps", () => {
  assert.doesNotMatch(source, /if \(!steps\.length\) return null/);
  assert.equal(source.includes("product-actions-empty-state"), true);
  assert.equal(source.includes("Добавьте шаг процесса, чтобы описать действия с продуктом."), true);
  assert.equal(source.includes("disabled={!steps.length}"), true);
});

test("ProductActionsPanel renders collapsible technical details block for AI_RESPONSE_PARSE_ERROR", () => {
  assert.equal(source.includes('data-testid="product-actions-ai-diagnostics"'), true);
  assert.equal(source.includes("Технические детали"), true);
  assert.equal(source.includes("aiDiagnostics"), true);
  assert.equal(source.includes("execution_id"), true);
  assert.equal(source.includes("parse_error"), true);
  assert.equal(source.includes("response_excerpt"), true);
  assert.equal(source.includes('aiProgress.errorCode === "AI_RESPONSE_PARSE_ERROR"'), true);
  assert.equal(source.includes("productActionsAiDiagnostics"), true);
  assert.equal(source.includes("productActionsAiDiagnosticsBody"), true);
});

test("ProductActionsPanel aiDiagnostics state is initialized to null and reset on hide", () => {
  assert.equal(source.includes("const [aiDiagnostics, setAiDiagnostics] = useState(null)"), true);
  assert.equal(source.includes("setAiDiagnostics(null)"), true);
  assert.equal(source.includes("setAiDiagnostics(result?.draft?.diagnostics || null)"), true);
});

test("ProductActionsPanel shows friendly message when AI returns zero suggestions", () => {
  assert.equal(source.includes('data-testid="product-actions-ai-empty"'), true);
  assert.equal(source.includes("AI не нашёл действий с продуктом"), true);
  assert.equal(source.includes("productActionsAiEmpty"), true);
});

test("ProductActionsPanel AI review uses compact card design with chips and confidence badge", () => {
  assert.equal(source.includes("productActionsAiCard"), true);
  assert.equal(source.includes("productActionsAiCardChips"), true);
  assert.equal(source.includes("productActionsAiCardTitle"), true);
  assert.equal(source.includes("productActionsAiConfidence"), true);
  assert.equal(source.includes("productActionsAiBadge"), true);
  assert.equal(source.includes("productActionsAiCardMeta"), true);
  assert.equal(source.includes("productActionsAiCardEdit"), true);
  assert.equal(source.includes("Редактировать поля"), true);
  assert.equal(source.includes("productActionsAiChip"), true);
  assert.equal(source.includes("confidenceLevel"), true);
  assert.equal(source.includes("confidencePct"), true);
  assert.equal(source.includes('data-testid="product-actions-ai-list"'), true);
  assert.equal(source.includes("productActionsAiReviewHead"), true);
  assert.equal(source.includes("productActionsAiReviewMeta"), true);
});

test("ProductActionsPanel AI review footer is sticky and has close and deselect actions", () => {
  assert.equal(source.includes("productActionsAiStickyFooter"), true);
  assert.equal(source.includes("productActionsAiFooterLeft"), true);
  assert.equal(source.includes("Закрыть AI-предложения"), true);
  assert.equal(source.includes("Снять выбор"), true);
  assert.equal(source.includes("Принять выбранные"), true);
});

test("ProductActionsPanel AI warning renders as muted note not plain div", () => {
  assert.equal(source.includes("productActionsAiWarningNote"), true);
  assert.equal(source.includes("productActionsAiWarningNoteIcon"), true);
  assert.equal(source.includes("w.code"), true);
  assert.equal(source.includes("warningText").valueOf(), true);
});

test("ProductActionsPanel step-switch useEffect clears AI state when aiDraftStepId is empty (Fix 2)", () => {
  // Guard must not include !aiDraftStepId — only !currentStepId is allowed as early return
  assert.doesNotMatch(
    source,
    /if \(!aiDraftStepId \|\| !currentStepId\) return/,
    "useEffect must not early-return when aiDraftStepId is empty (stale error state after step switch)",
  );
  assert.match(
    source,
    /if \(!currentStepId\) return;/,
    "useEffect must guard only on missing currentStepId",
  );
  // aiDraftStepId is now a ref — no useState setter
  assert.equal(source.includes('setAiDraftStepId("")'), false, "aiDraftStepId must not be useState (race condition fix)");
  assert.equal(source.includes("aiDraftStepIdRef"), true, "aiDraftStepId must be a useRef");
  assert.equal(source.includes('aiDraftStepIdRef.current = ""'), true);
  // Other state setters must be present in the cleanup branch
  assert.equal(source.includes("setAiDraft(null)"), true);
  assert.equal(source.includes("setAiRows([])"), true);
  assert.equal(source.includes("setSelectedAiRowIds(new Set())"), true);
  assert.equal(source.includes("setAiStatus(null)"), true);
  assert.equal(source.includes("setAiProgress(null)"), true);
  assert.equal(source.includes("setAiDiagnostics(null)"), true);
  // Effect must depend only on selectedStep — not on aiDraftStepId
  assert.match(
    source,
    /\}, \[selectedStep\]\);/,
    "step-switch useEffect must depend only on [selectedStep] to avoid re-triggering on aiDraftStepId write",
  );
});

test("ProductActionsPanel aiDraftStepIdRef is written on success and not a state variable (Fix draft-not-displayed)", () => {
  // Root cause fix: aiDraftStepId was useState, effect re-ran with stale "" on success → reset aiDraft
  // Fix: use useRef so writing aiDraftStepIdRef.current never triggers effect re-run
  assert.equal(source.includes("const [aiDraftStepId,"), false, "aiDraftStepId must not be useState");
  assert.equal(source.includes("aiDraftStepIdRef = useRef"), true, "aiDraftStepIdRef must be declared as useRef");
  assert.match(
    source,
    /aiDraftStepIdRef\.current = toText\(selectedStep\?\.id\)/,
    "aiDraftStepIdRef.current must be written with requestedStepId after successful suggest",
  );
  // Confirm the review panel render gate uses aiDraft (not aiDraftStepId)
  assert.equal(source.includes("{aiDraft ? ("), true, "aiDraft review panel must gate on aiDraft state");
});

test("ProductActionsPanel renders duplicate_reason text in duplicate AI suggestion cards (Fix 3)", () => {
  assert.equal(
    source.includes("duplicate_reason"),
    true,
    "duplicate_reason field must be accessed in JSX",
  );
  assert.equal(
    source.includes("productActionsAiCardDuplicateReason"),
    true,
    "productActionsAiCardDuplicateReason CSS class must be applied to duplicate reason element",
  );
  // The render must be guarded by both duplicate flag and non-empty duplicate_reason
  assert.match(
    source,
    /duplicate && toText\(row\.duplicate_reason\)/,
    "duplicate_reason must only render when duplicate=true and value is non-empty",
  );
});
