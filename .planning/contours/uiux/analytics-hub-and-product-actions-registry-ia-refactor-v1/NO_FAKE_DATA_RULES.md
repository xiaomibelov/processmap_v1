# No fake data rules

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`  
Run ID: `20260517T202836Z-17191`

## Canonical data boundary

Durable Product Actions truth остается текущим source: `interview.analysis.product_actions[]` and existing read-only frontend/backend flow. Этот contour не создает новую durable truth model.

## Запрещено

- Добавлять demo rows, seed rows, mock rows или placeholder actions в runtime UI.
- Показывать fake counts, fake completeness, fake filtered totals, fake last updated.
- Придумывать source sessions, process steps, tags, confidence, owner/status metadata.
- Заполнять empty workspace/project/session state synthetic examples.
- Писать Product Actions в BPMN XML.
- Автоматически применять AI/RAG output к Product Actions.
- Маркировать AI/RAG output как canonical/durable truth.
- Реализовывать `Реестр свойств` как будто durable source уже подтвержден.
- Добавлять backend/schema/migration changes для обхода отсутствующих fields.

## Разрешено

- Показывать empty/zero state, если он явно следует из текущего scope.
- Показывать disabled/unavailable state for project/session when scope is missing.
- Показывать placeholders only as future-module status for `Реестр свойств`, `Дашборды`, `Экспорт`.
- Использовать existing row fields for display/detail.
- Подписывать unknown/unavailable values as missing/unavailable, not invented.
- Использовать AI/RAG как read-only explanation, filter/search assistance or summary support.

## Reviewer checks

- Сравнить visible rows and counts with API/runtime data for the tested scope.
- Проверить empty workspace scenario: no demo/fallback rows.
- Проверить populated project scenario: row content matches real returned fields.
- Проверить sources: every displayed source is backed by current data flow.
- Проверить properties/dashboard/export cards: future/placeholder status is honest.
- Проверить browser network: navigation/viewing emits no unsafe `PUT`, `PATCH`, `DELETE`.
