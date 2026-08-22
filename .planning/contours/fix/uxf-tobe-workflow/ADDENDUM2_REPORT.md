# UXF Addendum-2 (A5–A9) — отчёт по реализации и приёмке

Дата: 2026-07-31 · Ветка: `feature/uxf-tobe-workflow-ux` (PR #634) · Контур: fix/uxf-tobe-workflow

## Состав работ

### A5 — «Экспорт ▾» удалён из среднего хедера
- ProcessStageHeader.jsx: дропдаун экспорта (кнопка, панель, стейт, capture-Escape) удалён целиком.
- Экспорт XML/DOC/DOD — через существующие вкладки центральной группы (не тронуты, проверено приёмкой).

### A6 — Меню TO BE: структурированный вид
- «Из этого процесса» (`tobe-current-process`): 1 строка — текущая сессия + действие
  «Создать TO BE» (primary) / «Открыть TO BE» (если derived существует).
- «Из проекта» (`tobe-project-list`): TO BE-сессии (◆) + AS IS-источники (◦), статус-действие
  справа («Создать»/«Открыть»), единая высота 34px; пустые источники — disabled «пустая».
- «Прочие (служебные)» — свёрнутый `<details>` со счётчиком (рендерится при наличии).
- Футер: «TO BE с чистого листа» с иконкой «＋» (primary).
- CSS: `.tobeSection__group/__caption/__footer`, disabled-стиль строки.

### A7 — Ревизия кнопок двух хедеров
- Средний хедер, слева: [💾 Сохранить][⑂ Версия BPMN] V.N Rev.M — действия стали иконками
  (inline SVG, без внешних библиотек) с тултипами/aria-label; no-diff hint сохранён.
  Справа: TO BE entry → undo/redo → ⋯.
- TopBar: кнопка «Технолог» скрыта на `/app` (дубль текущего местоположения);
  мёртвый пункт «Профиль — скоро» (alert-заглушка) убран из меню аккаунта.

### A8 — «Контекст процесса»
- Крошки: проект — реальная ссылка (→ список сессий проекта, проверено); текущая сессия —
  текст (ссылка вела на саму себя); крошка «Процесс» убрана (нет целевой страницы,
  обработчик был подменён таб-переключением, заголовок всегда fallback).
- Меню «⋯»: только рабочие пункты (rename/delete по правам + копия session id) — мёртвых нет.
- НОВОЕ: dock left/right — кнопка `sidebar-dock-toggle` в шапке сайдбара; состояние
  `dockSide` в useAppShellController, persist localStorage `ui.sidebar.dock_side`;
  grid-колонки `.workspace--dockRight` (normal/hidden/compact), resize-handle на левый
  край панели + инверсия дельты в useSidebarWidth.

### A9 — Свёрнутый сайдбар (rail)
- Набор иконок = реальный состав секций: TO BE / Свойства / Пути / Время шага /
  Robot Meta / Заметки / AI-вопросы / Шаблоны (App.jsx `sidebarHandleSections` +
  NotesPanel `sectionShortcuts` для compact-rail). Лимит 5 иконок в SidebarHandle снят.
- Новые глифы в sectionVisuals.jsx (tobe/properties/paths/time/robotmeta/advanced).
- Клик по иконке раскрывает панель СРАЗУ к секции (openSectionShortcut); найден и
  исправлен баг: в keyMap шорткатов отсутствовал ключ `tobe` — запрос отбрасывался.
- Бейджи: реальные счётчики заметок/AI-вопросов выбранного элемента (0 → бейдж скрыт).

## Дефекты, найденные приёмкой (исправлены)

1. keyMap без `tobe` — клик по иконке «TO BE» не открывал секцию (NotesPanel.jsx).
2. Скрипт: закрытие меню аккаунта через Escape сворачивало сайдбар (глобальный
   обработчик SidebarShell) — в приёмке меню закрывается повторным кликом.
3. #627 fix-check: запускался против stage (E2E_BASE не был выставлен) и проверял
   legacy-маркер «(текущая)» — адаптирован под A6 (группа «Из этого процесса»),
   поиск другой TO BE-сессии — по `.tobeRow__status`.

## Приёмка (preview build → реальный stage, проект c0494e0667)

| Проверка | Результат |
|---|---|
| `uxf_check_addendum2.mjs` (A5–A9) | EXIT=0 |
| `uxf_check_addendum.mjs` (A1–A4/A7, обновлён) | EXIT=0 |
| `uxf_check_bugs.mjs` (Блок 1) | EXIT=0 |
| `uxf_check_block2.mjs` (Блок 2) | EXIT=0 |
| `w4_tobe_current_fix_check.mjs` (#627, E2E_BASE=preview) | EXIT=0 |
| vitest | 81/81 (594 collect-fail — pre-existing baseline) |
| node --test (contract + sidebar width) | 10/10 |
| node --test src/features/process | 1343/20 = baseline |

Факты приёмки addendum-2:
- A5: export-menu отсутствует; табы [Анализ, Diagram, XML, DOC, DOD, Аналитика] на месте.
- A7: leftOrder [save, create-revision, version-chip, rev-chip, fps]; SVG-иконки,
  тултипы «Сохранить текущее состояние сессии»/«Создать версию BPMN…»; «Технолог» скрыт.
- A6: currentRows=1 «Открыть TO BE»; captions оба; heights 34px ×8; rightGap 9px;
  пустой источник disabled «пустая»; футер primary с «＋».
- A8: крошка проекта → `/app?project=…` (session убран, «Новая сессия» видна);
  dock: leftX 12→1368, persist `right` после reload, возврат `left`.
- A9: rail 8 иконок в порядке spec, muted для element-секций без выбора;
  клик «Свойства» → панель к properties (aria-expanded), клик «TO BE» → к tobe.

## Критерии addendum-2 — статус

- Скрины до/после по пунктам: ✅ `docs/uxf/addendum2_*` («до» — `docs/uxf/addendum_*` addendum-1).
- Клик по иконке rail → сайдбар к нужной секции: ✅ скринкаст `addendum2_rail_section.webm`.
- Dock left/right с persist: ✅ скринкаст `addendum2_dock_toggle.webm` (+ reload-проверка).
- Крошки ведут на реальные страницы: ✅ проект — ссылка (проверена), сессия — текст.
- Иконки сохранить/версия слева с тултипами: ✅ `addendum2_a5_header_no_export.png`.

## Открытые хвосты (из addendum-1, не блокеры)

- ee_time live-скрин (на stage нет сессий с тегами; unit 4/4).
- Чистка 38 дублей TO BE — 403 (нет права delete у demo-аккаунта).
- recipe publish 422 — pre-existing backend stage.
