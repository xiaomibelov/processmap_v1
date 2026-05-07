import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "ProductActionsPanel.jsx"), "utf8");

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
  assert.equal(source.includes("Предложить действия через AI"), true);
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
