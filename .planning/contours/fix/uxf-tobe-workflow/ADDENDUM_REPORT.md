# UXF Addendum (A1–A4) — отчёт по реализации и приёмке

Дата: 2026-07-31 · Ветка: `feature/uxf-tobe-workflow-ux` · Контур: fix/uxf-tobe-workflow

## Состав работ

### A1 — Меню TO BE: список действий
- `TobeSection` (NotesPanel.jsx) переписан на паттерн списка: строка = иконка · название · статус
  («текущая» / «Открыть» / «Создать» / «(пустая)»), высота строки 34px, одна строка на источник.
- «Прочие (служебные)» — свёрнутый `<details data-testid="tobe-other">` внизу списка.
- «TO BE с чистого листа» — primary-опция (`tobeRow--primary`).
- Заголовок «AS IS — процесс из ProcessMap:» убран.

### A2 — «Доп. информация» → сводка процесса
- Новый чистый парсер `frontend/src/lib/processSummary.js`: состав (задачи/развилки/подпроцессы/события),
  дорожки (имена), ee_time (Σ, критический путь по sequenceFlow-графу, разрез ручное/оборудование).
  Тело subProcess обрезается по первому вложенному flowNode — иначе ee_time вложенных задач дублируется.
- NotesPanel: секция сводки (Статус, Состав, Дорожки, Длительность по ee_time),
  «Технические детали» свёрнуты в `<details>`, догрузка XML (`apiGetBpmnXml`) при пустом draft.
- При отсутствии ee_time-тегов показывается «нет данных ee_time».

### A3 — Сегмент «Схема | TO BE» на всех экранах пути
- Проверено приёмкой: сегмент виден и корректно переключается на экране схемы и в режиме TO BE.

### A4 — Средний хедер
- Слева: только версионные чипы V/Rev (+ FPS-meter).
- Справа порядок: «Создать/Открыть TO BE» → «Сохранить» (primary) → «Создать версию BPMN» →
  «Экспорт ▾» (XML/ZIP/DOC/DOD) → undo/redo → ⋯.
- Экспорт-дропдаун: `diagram-toolbar-export-menu` + пункты `-xml/-zip/-doc/-dod`.

## Дефекты, найденные приёмкой addendum (исправлены)

1. **Escape закрывал левый сайдбар вместе с дропдауном** — глобальный window-обработчик
   SidebarShell срабатывал одновременно с закрытием меню экспорта. Фикс: обработчик Escape
   меню переведён на capture-фазу + `stopPropagation` (ProcessStageHeader.jsx).
2. **Перекрытие кнопки «Открыть TO BE» центральными табами** (регрессия A4-раскладки):
   grid `minmax(0,1fr) auto minmax(0,1fr)` + `width:max-content` центра → правый слот (645px)
   клипповался, центр наезжал на кнопку входа. Фикс: `minmax(0,1fr) minmax(0,auto) auto`,
   центр `max-width:100%` со скроллом табов, правый слот всегда по контенту.
3. **Приёмочные скрипты**: `uxf_check_bugs.mjs` B4 адаптирован под разметку A1
   (`.tobeRow__status`); `uxf_check_addendum.mjs` — строгая проверка высот (0px = фейл),
   страховка переоткрытия панели.

## Приёмка (preview build → реальный stage, проект c0494e0667)

Все прогоны на финальном build, свежий токен (TTL ~15 мин):

| Проверка | Результат |
|---|---|
| `uxf_check_addendum.mjs` (A1–A4) | EXIT=0 |
| `uxf_check_bugs.mjs` (Блок 1: B1/B3/B4/B5) | EXIT=0 |
| `uxf_check_block2.mjs` (Блок 2) | EXIT=0 |
| `w4_tobe_current_fix_check.mjs` (#627) | EXIT=0 |
| vitest | 81/81 (594 collect-fail — pre-existing baseline) |
| node --test ProcessStageHeader contract | зелёный |
| `processSummary.test.mjs` | 4/4 |

Ключевые факты приёмки addendum:
- A1: 46 строк, heights `[34×6]`, статусы «Открыть», `blankPrimary`, legacy-заголовок отсутствует.
- A2 (суп, ee_time-тегов нет): `задачи 23 · развилки 3 · подпроцессы 0 · события 4`,
  дорожки `3: Работа манипуляторов, Работа оборудования, Работа оператора`, «нет данных ee_time»,
  техдетали свёрнуты.
- A4: порядок `[tobe-entry, save, create-revision, export-menu, undo, redo, overflow]`,
  `saveClipped:false`, слева только чипы.
- A3: сегмент виден/активен на схеме и в TO BE.

## Критерии addendum — статус

- Скрины до/после по каждому пункту: ✅ `docs/uxf/addendum_a1_tobe_action_list.png`,
  `addendum_a2_summary_no_eetime.png`, `addendum_a3_mode_switch_tobe.png`,
  `addendum_a4_header_export_menu.png` (+ обновлённые регрессионные скрины Блока 1/2, #627).
- Расчёт ee_time на сессии с тегами: ⚠️ live — на stage-сессиях тегов ee_time нет,
  показано состояние «нет данных ee_time»; расчёт покрыт unit-тестами
  (`processSummary.test.mjs` 4/4: Σ=20.5 мин, критический путь, разрез ручное/оборудование).
  Live-скрин возможен после появления сессии с тегами (мутация stage — с подтверждением владельца).
- Переключатель режимов на всех экранах пути: ✅.

## Открытые хвосты (не блокеры)

- Чистка 38 дублей TO BE — HTTP 403 для `technologist-demo` (нет права delete); ждёт аккаунт владельца.
- recipe publish 422 — pre-existing backend stage, отдельный контур (кандидат E7).
- Расхождение «594 ревизии» vs 10 в bpmn_versions — зафиксировано в B2_REPORT.md.
