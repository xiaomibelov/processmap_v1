# 2026-05-17 - uiux product actions registry inner page safe redesign v1 - layout rework v2 planning

Контур: `uiux/product-actions-registry-inner-page-safe-redesign-v1`

## Что сделано

Agent 1 / Planner подготовил следующий rework planning pack для страницы «Реестр действий с продуктом» после нового пользовательского runtime feedback.

Созданы/обновлены артефакты:

- `.planning/contours/uiux/product-actions-registry-inner-page-safe-redesign-v1/UI_LAYOUT_REWORK_V2_PLAN.md`
- `.planning/contours/uiux/product-actions-registry-inner-page-safe-redesign-v1/UI_LAYOUT_REWORK_V2_REASON.md`
- `.planning/contours/uiux/product-actions-registry-inner-page-safe-redesign-v1/WORKER_2_REWORK_PROMPT.md`
- `.planning/contours/uiux/product-actions-registry-inner-page-safe-redesign-v1/WORKER_3_REWORK_PROMPT.md`
- `.planning/contours/uiux/product-actions-registry-inner-page-safe-redesign-v1/REVIEWER_REWORK_PROMPT.md`
- `.planning/contours/uiux/product-actions-registry-inner-page-safe-redesign-v1/UI_RUNTIME_ACCEPTANCE_CHECKLIST.md`
- `.planning/contours/uiux/product-actions-registry-inner-page-safe-redesign-v1/SECTION_SEPARATION_CHECKLIST.md`
- `.planning/contours/uiux/product-actions-registry-inner-page-safe-redesign-v1/REWORK_STATE.json`
- `.planning/contours/uiux/product-actions-registry-inner-page-safe-redesign-v1/CHANGES_REQUESTED`

## Что доказано

- Source/runtime truth на момент планирования зафиксирован.
- RAG preflight planner выполнен и сохранён в contour directory.
- Agent 1 не менял product code.
- Worker 2 и Worker 3 разделены независимо.
- Только Agent 4 должен ждать `WORKER_2_DONE` и `WORKER_3_DONE`.
- Для блокировок используются только part-specific markers:
  - `EXEC_PART_1_BLOCKED.md`
  - `EXEC_PART_2_BLOCKED.md`

## Что осталось

- Worker 2 должен реализовать UI refinement: компактные метрики, ясный back action, utility exports, Explorer-like scope semantics, section separation.
- Worker 3 должен независимо подготовить UX/spec checklist и runtime review rubric.
- Agent 4 должен проверить свежий runtime на `5180` и выдать `REVIEW_PASS` только если браузерно видны улучшения.

## Риски

- Рабочее дерево `/opt/processmap-test` dirty и не является canonical root из operating contract. Это не блокирует planning-only шаг, но Worker 2 обязан отдельно доказать безопасную изоляцию перед product-code edits.
- Существующий historical `REVIEW_PASS` по этому contour не должен считаться актуальным, пока новый `CHANGES_REQUESTED` не закрыт runtime review.

