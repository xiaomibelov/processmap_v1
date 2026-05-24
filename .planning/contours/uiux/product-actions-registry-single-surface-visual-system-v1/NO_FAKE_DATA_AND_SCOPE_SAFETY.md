# NO_FAKE_DATA_AND_SCOPE_SAFETY

Контур: `uiux/product-actions-registry-single-surface-visual-system-v1`

## Canonical data rule

Product Actions durable truth остается `interview.analysis.product_actions[]`. Этот contour не меняет backend, schema, BPMN XML, RAG runtime или AI behavior.

## No fake data

Запрещено:

- подставлять mock Product Actions;
- показывать fake rows для красивого populated state;
- считать fake metrics при empty scope;
- скрывать отсутствие данных через placeholder rows;
- добавлять hardcoded totals;
- показывать fake export availability, если export не имеет реального dataset;
- использовать RAG output как источник runtime Product Actions.

## Scope safety

Agent 4 должен проверить, что:

- Workspace, project и session scopes не смешивают данные.
- Filtered count считается из real current scope.
- Warning появляется из real incomplete rows.
- `Показать только неполные`, если есть, включает real completeness filter.
- Export берет существующий registry dataset/scope, а не dashboard-level synthetic aggregation.
- AI controls не переходят на Analytics Hub state и не используют скрытую dashboard dependency.

## Runtime mutation safety

Просмотр, navigation, scope switch и filters не должны выполнять unsafe mutations:

- нет `PUT` при обычном просмотре;
- нет `PATCH` при обычном просмотре;
- нет `DELETE` при обычном просмотре;
- нет BPMN XML write;
- нет Product Actions auto-apply.

Исключение возможно только если implementation report заранее явно allowlist-ит конкретный endpoint и Agent 4 доказывает, что это существующий harmless read/session bookkeeping behavior.

## RAG boundary

RAG preflight является read-only context layer:

- не мутирует код;
- не мутирует planning state без явной записи агента;
- не пишет BPMN XML;
- не применяет Product Actions;
- не заменяет runtime/source truth.

## Review blocker

Если runtime показывает fake data, mixed scope, auto mutation или Analytics Hub dependency, Agent 4 обязан блокировать pass независимо от визуального качества.
