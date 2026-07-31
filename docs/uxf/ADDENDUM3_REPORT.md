# ADDENDUM-3 к UXF: переработка хедеров — отчёт о реализации

Дата: 2026-07-31 · Ветка: `feature/uxf-tobe-workflow-ux` · Приёмка: `scripts/uxf_check_addendum3.mjs` → **EXIT=0**

## Что сделано

### 1. Переключатель «Схема | TO BE» — из верхнего хедера во вторую строку
- Из TopBar сегмент **удалён полностью** (в верхнем хедере его нет ни в одном режиме).
- Новый общий компонент `frontend/src/components/ModeSwitchSegment.jsx` (те же
  data-testid `mode-switch` / `mode-switch-schema` / `mode-switch-tobe`, те же
  тултипы, focus-visible стили, клавиатурная доступность — нативные `<button>`).
- Средний хедер (`ProcessStageHeader`): сегмент встроен **сразу справа от вкладки
  «Diagram (BPMN)»**, между ней и «XML», с тонкими разделителями:
  `[Анализ процессов][Diagram (BPMN)] | [Схема|TO BE] | [XML][DOC][DOD][Аналитика]`.
- В режиме TO BE средний хедер подменяется тулбаром рабочего места (как раньше),
  а сегмент **остаётся на виду** — вверху левой панели TO BE (`tobeLeftPanel`),
  активен «TO BE»; клик «Схема» — мгновенный возврат.
- Переключение в обе стороны — **без перезагрузки** (проверено маркером
  `beforeunload`: `navCount===0` в обе стороны; наследие #627 не сломано —
  `w4_tobe_current_fix_check.mjs` зелёный).
- Скринкаст: `docs/uxf/addendum3_mode_switch.webm`.

### 2. Верхний хедер — полная переработка (тонкий контекстный бар)
- **СЛЕВА**: логотип PROCESSMAP · «← К проекту» · хлебные крошки
  `Проект «…» / Сессия «…»`:
  - проект — реальная ссылка (клик → список сессий проекта, проверено: URL
    теряет `session=`, открывается workspace проекта);
  - сессия — текст (текущий контекст, по решению A8);
  - обе крошки — ellipsis-обрезание + полное имя в тултипе
    (`Проект: Технолог WS3 (демо) — к списку сессий`, `Сессия: Разогрев супа`).
- **ЦЕНТР**: статус сессии (● Черновик) — информационный `<span>`, не кнопка;
  dropdown смены статуса из хедера убран (рабочее действие; смена статуса
  остаётся в списке сессий). При сохранении — спиннер «Сохранение…».
- **СПРАВА**: ORG («Default», truncate + тултип с полным именем) ·
  «Админ-панель» (см. п.3) · аватар с меню (тема/уведомления/выйти).
- **Убрано из хедера**: переключатель «Схема/TO BE», капсулы ПРОЕКТ/СЕССИЯ с
  меню действий («Новый проект», «Удалить проект/сессию» — дубли рабочих
  действий), кнопочный статус-dropdown. Мёртвые testid'ы
  (`topbar-project-actions-*`, `topbar-session-actions-*`,
  `topbar-status-change-menu`, `topbar-project/session-title`) удалены,
  висячие state/refs/effects вычищены.
- **Тонкий бар**: высота **45px** (было ~56px), `py-2→py-1.5`, кнопки h-9→h-8,
  бренд text-xl→text-lg, без многострочных капсул.

### 3. «Админ-панель» — RBAC
- Видимость: `user.is_admin || org_role ∈ {org_owner, org_admin, auditor}`.
- Под technologist-demo (`role=technologist`, `is_admin=false`, org role
  `editor`) кнопка **скрыта** — проверено приёмкой (`topbar-admin-button`
  отсутствует в DOM). Поведение соответствует RBAC-паттерну, изменений не
  потребовалось.

### 4. Бейдж аватара — решение зафиксировано
- Бейдж (`9+` при >9) питается из **реального фида уведомлений**
  (`noteNotifications` с backend / fallback на mentions + агрегаты сессий,
  `badgeCount` из `buildAccountDiscussionNotificationGroups`).
- Решение: **оставить**. Приёмка проверяет консистентность: бейдж ⇔ строки в
  меню (на демо-аккаунте сейчас 0 непросмотренных → бейджа нет, в меню
  «Нет уведомлений» — шума нет).

## Приёмка (EXIT=0)
- К1: в TopBar нет mode-switch; сегмент — между Diagram и XML, «Схема» активна,
  клавиатурно доступен; переключение туда/обратно без перезагрузки (видео).
- К2: крошки со ссылками/тултипами (клик по проекту → список сессий), статус
  информационный в центре, справа ORG/аватар.
- К3: «Админ-панель» под technologist скрыта.
- К4: бейдж консистентен с реальными уведомлениями.
- К5: хедер 45px, капсул/меню нет.
- К6: TO BE из сегмента — без моргания; сегмент на виду в TO BE; рабочее место
  (шаги, AS IS) и сайдбар-панели не сломаны.

## Скрины
- `addendum3_topbar_thin_context_bar.png` — новый верхний хедер.
- `addendum3_segment_after_diagram_tab.png` — сегмент после Diagram (панель открыта).
- `addendum3_tobe_mode_switch_visible.png` — сегмент в TO BE (левая панель).
- `addendum3_back_to_schema_segment.png` — возврат в «Схему».
- `addendum3_account_badge_notifications.png` — меню аккаунта/уведомления.
- `addendum3_crumb_project_target.png` — цель крошки проекта (список сессий).
- «До» — скрины addendum-2 (`addendum2_a5_header_no_export.png` и др.).

## Регрессия (всё EXIT=0, preview 127.0.0.1:5198 → stage API)
- `uxf_check_addendum.mjs` (A1–A4) — зелёный.
- `uxf_check_addendum2.mjs` (A5–A9) — зелёный.
- `uxf_check_block2.mjs` (Блок 2) — зелёный.
- `w4_tobe_current_fix_check.mjs` (#627, через E2E_BASE=preview) — зелёный.
- `node --test src/features/process` — 1343 pass / 20 fail = baseline.
- `ProcessStageHeader` контрактные тесты (revision-action, undo-redo-layout) — 5/5.

## Затронутые файлы
- `frontend/src/components/ModeSwitchSegment.jsx` — NEW (общий сегмент).
- `frontend/src/components/TopBar.jsx` — переработка (крошки, статус, тонкий бар,
  чистка мёртвого кода).
- `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx` — сегмент после
  вкладки Diagram.
- `frontend/src/features/process/stage/orchestration/buildDiagramViewModel.js`,
  `frontend/src/components/ProcessStage.jsx`, `frontend/src/components/AppShell.jsx` —
  прокидывание `modeSwitch`.
- `frontend/src/App.jsx` — сегмент в левой панели TO BE.
- `scripts/uxf_check_addendum3.mjs` — NEW (приёмка + видео).

## Не тронуто (инварианты)
bpmn.io канвас, XML E7, Validation E6, RBAC-логика, i18n, overlay OL1,
read-only AS IS md5-инвариант, слот «Открыть TO BE» в среднем хедере (A6/addendum-1).
