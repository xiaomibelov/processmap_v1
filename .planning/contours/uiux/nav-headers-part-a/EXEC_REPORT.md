# EXEC_REPORT — uiux/nav-headers-part-a (часть А, уточнённая)

Дата: 2026-08-15 · Ветка: `uiux/nav-headers-part-a` (worktree `/opt/processmap-test-worktrees/nav-headers-part-a`, от `origin/main` fa4ab25e) · Роль: Executor

## Скоуп

Уточнение к части А (заменяет пп.1–2 ранее согласованного) + остальная часть А:
кнопка «назад» на всех трёх уровнях, текстовые крошки под ней, без чипов/подписи
«Навигация», статус-бейдж рядом с H1, крошки 12–13px, полоса над
ProcessStageHeader на странице сессии, H1+статус, мета-строка, сворачивание в «…».

## Архитектурное решение (согласовано с владельцем)

Навигационная зона — **общий chrome `workspaceMain`**: слот
`[data-testid="workspace-main-nav"]` в `AppShell` первым ребёнком `workspaceMain`.
- Сессия: `SessionNavStrip` рендерится в слот напрямую (AS IS и TO BE, т.к. TO BE = stageOverride).
- Раздел/проект: `ExplorerPane`/`ProjectPane` порталят свой хедер-блок в слот через
  `WorkspaceMainNavSlotContext` (`createPortal`); fallback — рендер на месте, если слота нет.
  `ExplorerPane` глушит портал (`portalHeader={!currentProjectId}`), т.к. остаётся
  смонтированным (скрытым) при открытом проекте.
- В explorer-режиме (нет сессии) `ProcessStageHeader` (тулбар с табами сессии) скрыт.

## Что сделано

1. **Новый shared-компонент** `frontend/src/components/TextBreadcrumbs.jsx` +
   чистая логика `textBreadcrumbs.js#collapseBreadcrumbTrail`:
   - родители — приглушённые текстовые ссылки (`text-muted`, hover:underline);
   - текущий сегмент — `span text-fg` без ссылки (`data-current="true"`);
   - разделитель ` / `, размер 13px; без чипов/фонов/рамок;
   - > 4 сегментов → `первый / … / два последних`, «…» разворачивает по клику.
2. **Раздел (ExplorerPane)**: кнопка «← Назад к разделам» (видна внутри раздела,
   шаг на уровень вверх; `explorer-back-sections`), крошки `explorer-breadcrumbs`,
   H1 `explorer-section-title`, мета «Разделов/Папок: N · Проектов: M»
   (`explorer-section-meta`). Старый локальный `Breadcrumb` удалён.
3. **Проект (ProjectPane)**: «← Назад к разделу» (`project-back-section`; fallback
   на `proj.folder_id` при прямом заходе по URL), текстовые крошки
   `project-breadcrumbs` (чипы `BreadcrumbChip` и подпись «Навигация» удалены),
   H1 `project-title` + `StatusBadge` (кроме пустого/active — конвенция таблицы),
   мета «Сессии: N».
4. **Сессия**: `SessionNavStrip.jsx` — «← Назад к проекту» (testid
   `topbar-back-projects` сохранён), крошки `topbar-breadcrumbs`
   (workspace/папки из `projectRouteContext.breadcrumbBase` → проект → сессия
   → «TO BE» при stageOverride; testid'ы `topbar-crumb-*` сохранены),
   H1 `session-nav-title` + статус-пилюля `topbar-session-status` рядом,
   мета «Тип: AS IS|TO BE» (`session-nav-meta`).
5. **TopBar очищен**: кнопка назад, `topbarCrumbs`, статус-пилюля из `topCenter`
   удалены (вместе с `STATUS_CHIP_STYLES`/`normalizedSessionStatus`/
   `sessionStatusMeta`/`hasActiveSession` — мёртвый код убран).
6. **Приёмка-скрипт** `scripts/e2e/nav_zone_part_a.mjs` (Playwright):
   14 проверок + 3 скриншота навигационной зоны.

## Приёмка (EXIT=0, 14/14)

- Скрины: `.planning/contours/uiux/nav-headers-part-a/screens/level{1,2,3}_*.png`.
- Кнопка «назад» пиксель-в-пиксель на всех уровнях: (93,76) × 3.
- Крошки 13px, отступ кнопка→крошки = 4.0px на всех уровнях.
- В строке пути 0 чипов; текущий сегмент — текст.
- Статус-бейдж на странице сессии — на строке H1 (y=138), не в строке пути (y=112).
- Окружение приёмки: vite dev :5231 (код ветки) против stage API :8011,
  org «Default», проект `0715811eb7`.

## Тесты

- Полный suite `node --test`: 3003 теста, 62 падения — **дельта с origin/main = 0**
  (все 62 падают и на чистом main; baseline-прогон в `/tmp/pm-baseline`).
- Обновлены: `workspaceProjectBreadcrumb.source.test.mjs`,
  `tobeLeaveGuard.test.mjs` (крошка TO BE → SessionNavStrip),
  `dark-theme-contrast.test.mjs` (statusComboPill → SessionNavStrip).
- Новые: `TextBreadcrumbs.test.mjs` (5), `navZonePartA.source.test.mjs` (6).
- `vite build`: EXIT=0 (27.7s соло; при параллельном прогоне тестов на 4GB-хосте ловил OOM).

## Ограничения / известные допущения

- Крошки workspace/папок на странице сессии ведут в корень explorer
  (глубокая навигация до папки из сессии не заведена).
- При прямом заходе на проект по URL трейл = только имя проекта (backend
  `/api/projects/{id}/explorer` не отдаёт breadcrumbs).
- Testid'ы `topbar-*` осознанно сохранены на перенесённых элементах (e2e-контракты).
- На корневом уровне workspace кнопки «назад» нет (некуда) — выбор владельца.
- TO BE: полоса рендерится над stageOverride — проверено вживую (скрин
  `level3_session_tobe.png`: крошки «… / TO BE», мета «Тип: TO BE», pageerror нет).
