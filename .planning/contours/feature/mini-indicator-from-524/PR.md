# PR.md — draft (RU). Property Panel UX Redesign (Phase UX-1)

> Черновик описания PR. Публикуется только после phase gates G-P0…G-P4 и явного approve.

---

## Что

UX-перестройка панели «Свойства» в сайдбаре — без изменений данных, save pipeline и backend.

| Блок | Было | Стало |
|---|---|---|
| Режим показа свойств | 3 конфликтующих чекбокса (невалидные комбинации) | Segmented control «При наведении / Всегда / Скрыто» (radio-паттерн, instant preview) |
| V2-оверлеи | 2 зависимых чекбокса без иерархии | Toggle «V2-оверлеи» + dependent sub-control «Компактно / Раскрыто» (скрыт при OFF) |
| Быстрые свойства | Таблица с placeholder-строками «—» и постоянными иконками | Chip-лист `name: value`, muted «—», hover-actions, «+ Добавить» chip |
| BPMN-свойства | Таблица с колонкой действий | Компактный KV-лист, click-to-edit, hover-actions, inline add-form, empty-state |
| Сохранение | Два оторванных футера | Floating SaveBar ≤48px, виден только при наличии изменений |

## Почему

Mutually exclusive состояния — radio, не checkboxes (невалидные комбинации исключены структурно). Sparse-таблицы с «—» скрывают CTA и шумят; chips/KV-лист + hover-actions возвращают фокус на данные. Save/Reset в контексте редактирования.

## Что НЕ изменилось (invariants)

- Save pipeline (camunda → documentation → paths → stepTime → robotMeta, 409 rollback) — байт-в-байт.
- Per-element флаг `fpc-show-properties` — сохранён (toggle «Показывать над этой задачей»), пишет в XML как раньше.
- Mini-indicator (#526) в шапке вкладки — нетронут; показывает dirty/saved синхронно с SaveBar.
- Backend, XML-каноника, overlay pipelines (legacy + V2).

## Migration guide

- Данные: миграция не требуется — localStorage-ключи и XML-флаг прежние; display mode derive-ится из существующих двух булевых настроек (hidden = оба OFF).
- Пользователям: привычные режимы = сегменты; «expanded» переехал в dependent sub-control.
- E2E-селекторы: legacy testid чекбоксов (`bpmn-show-properties-checkbox` и др.) заменены на `display-mode-segment-*` / `v2-toggle` — specs обновлены в этом PR.

## Rollback plan

1. Revert merge-commit PR (один squash) — UI возвращается к чекбоксам/таблицам; данные не затронуты.
2. Stage: rebuild из предыдущего SHA + rotate container (build-info проверить).
3. E2E регрессия: process-properties 5/5 + extension-state-mini 2/2 + v2-overlay-persistence 3/3.

## Verification (заполняется по gates)

- Unit sweep 51=51 (baseline main), foundation 10/10, новые pure-node тесты N/N
- Build OK; token-only CSS grep gate
- Stage E2E: property-panel-ux T1–T12 ✓ + регрессия ✓

**Do not merge without explicit owner approval.**
