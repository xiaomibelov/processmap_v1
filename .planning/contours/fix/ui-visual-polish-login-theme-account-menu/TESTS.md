# TESTS — fix/ui-visual-polish-login-theme-account-menu

> Дата: 2026-09-22. Среда: worktree от `origin/main` (c5db40a9), `npm ci` выполнен.

## Новые тесты (зелёные)

| Файл | Что покрывает | Результат |
|---|---|---|
| `frontend/src/lib/theme.test.mjs` | `resolveInitialTheme`: пусто/мусор → `light`; `dark`/`light` сохраняются; `applyInitialTheme` ставит класс корня; контракт ключа `fpc_theme` | 5/5 pass |
| `frontend/src/styles/bpmn-powered-by.test.mjs` | `.bjs-powered-by { display: none !important }` присутствует в 02-02; guard'ы контекстного меню сохраняют селектор | 2/2 pass |

## Обновлённые тесты (осознанно)

| Файл | Изменение | Причина |
|---|---|---|
| `frontend/src/components/TopBar.discussion-notifications.test.mjs` | regex строк превью: `rounded-md` → `rounded-lg` | новая разметка строк уведомлений (flex + иконка) |

## Полный сравнение с baseline (pristine main, те же node_modules)

- Baseline: 4113 тестов → 4031 pass / **78 fail** (pre-existing).
- После правок: 4113 тестов → 4032 pass / **77 fail**.
- Δ: +1 pass («TopBar profile menu keeps account actions separate from notifications» — закрыт добавленным `topbar-account-profile-soon`), −1 fail, **0 регрессий** (diff списков failing-подтестов пуст по существу; `useSessionPresence.*` флакует под параллельной нагрузкой сьюта — в изоляции 3/3 зелёный, не затронут контуром).

## Pre-existing красные (не контур, зафиксировано)

- `TopBar filters status options by allowed transitions`, `TopBar disables status control while a change in flight` — stale regex против рефакторинга sessionStatus.
- `dark-theme-contrast.test.mjs` (appVersion `v1.0.141`, sidebar/topbar contrast guards) — устаревшие ожидания на main.
- Прочие ~70 failing-файлов на main (см. `/tmp/baseline-tests2.log`) — вне скоупа контура.

## Сборка

- `npm run build` (vite) — зелёная, 3 прогона (после каждой итерации).

## Живая приёмка (production bundle `vite preview` :5198 → API :8011)

Скриншоты в `evidence/` (сняты headless Chromium, 1440/1280/390):

- `01-login-light-1440.png` — первый визит, чистый localStorage → **светлая** тема (класс `html` = `light`, зафиксировано скриптом).
- `02-login-error-light-1440.png` — inline-ошибка «Неверный email или пароль» под полями.
- `03-login-invite-entry-light-1440.png` — режим «Доступ по инвайту» в том же языке.
- `04-login-light-1280.png`, `05-login-light-mobile.png` (390px, без горизонтального скролла).
- `06-login-dark-1440.png` — тёмная тема по явному выбору (`fpc_theme=dark`).
- `07-after-login-light-1440.png` — рабочая зона в светлой теме после входа.
- `08-account-menu-light-1440.png`, `10-account-menu-dark-1440.png` — меню аккаунта: аватар-инициал, «Профиль · скоро», badge-free empty state «Нет уведомлений» (без дубля сводки), тумблер темы с иконкой, «Выйти» в danger-токенах.
- `09-notification-center-light.png` — центр уведомлений (визуальное согласование сохранено).
- `canvas-light.png`, `canvas-dark.png` — канвас modeler: `.bjs-powered-by` → `display=none`, rect 0×0 в **обеих** темах (проверено getComputedStyle).
- Переключение темы → перезагрузка → тема сохраняется (light↔dark в сценарии съёмки).

## Пост-мерж проверка (2026-09-22, vs bf6cca46)

| Прогон | tests | pass | fail |
|---|---|---|---|
| pristine main bf6cca46 (baseline) | 4119 | 4038 | 77 |
| ветка + merge 8c646d43 | 4126 | 4045 | 77 |

- Регрессий нет: множество упавших файлов идентично baseline (32 файла, списки совпали `comm`).
- Δ = +7 pass — это наши новые тесты (`theme.test.mjs` 5/5, `bpmn-powered-by.test.mjs` 2/2).
- Таргетно после мержа: контур-тесты 13/13; appUpdate-тесты #1012 — 58/58; `npm run build` — зелёный.
