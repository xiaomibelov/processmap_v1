# PLAN — fix/ui-visual-polish-login-theme-account-menu

> Дата: 2026-09-21. Контур: визуальная полировка фронтенда, 4 правки.
> Ветка: `fix/ui-visual-polish-login-theme-account-menu` от `origin/main` (c5db40a9).
> Runtime/source truth: worktree `processmap_v1_main_clone-worktrees/fix-ui-visual-polish-login-theme-account-menu`, clean, remote `git@github.com:xiaomibelov/processmap_v1.git`.
> Дизайн-вход: skill `ui-ux-pro-max` (диагностика ниже). Merge/deploy — только владельцем после approve. Финал контура — открытый PR.

## Дизайн-диагностика (ui-ux-pro-max)

Запросы (login/auth, forms, dropdown, notifications). Применимые рекомендации:

- **Формы:** видимые label над полем (уже есть), `type="email"` (уже есть), inline-ошибка под полем + alert-блок (уже есть; усилим связку через `role="alert"`, сохранено), видимое focus-кольцо (глобально задано `*:focus-visible` в tailwind.css — сохранить, не затирать `outline-none` без замены).
- **Hover/focus:** плавные hover-состояния 150–300ms на всех кликабельных элементах меню.
- **Empty state:** единая плашка «Нет уведомлений» — убрать дублирование сводки.
- **Badge-счётчик:** один статусный индикатор, не дублировать live-регионы.
- **Destructive:** «Выйти» визуально отделён (danger-токены), без confirm-диалога нативного (уже `window.confirm` — НЕ трогаем, вне скоупа).
- **Палитра/шрифты из skill (black+gold, Cormorant/Montserrat): НЕ применяются** — вне токенов дизайн-системы (`--pm-*`/hsl-токены в `styles/tokens.css`); существующие токены: `--bg/--bg-soft/--panel/--panel2/--fg/--muted/--border/--accent/--danger/--info/--ring` (light + `.dark`).

## Правка №2 — светлая тема по умолчанию (дефолт light)

- `frontend/src/main.jsx`: дефолт `stored === "dark" ? "dark" : "light"`, ветка `catch` → `light`.
- Выделить чистую функцию `resolveInitialTheme(stored)` в `frontend/src/lib/theme.js` (+ `THEME_STORAGE_KEY`), чтобы покрыть unit-тестом реальным поведением, а не regex.
- `frontend/src/components/TopBar.jsx`: `useState("dark")` → инициализация из `document.documentElement` на первом рендере (lazy init), `catch`-ветка → `"light"`.
- Сохранённое `fpc_theme=dark` продолжает работать; FOUC-инициализация в `main.jsx` до рендера сохранена.
- Тест: `frontend/src/lib/theme.test.mjs` — чистый localStorage → `light`; `dark` → `dark`; мусор → `light`.

## Правка №4 — скрыть логотип bpmn.io

- CSS `frontend/src/styles/app/02/02-02-bpmn-viewer-core.css`: `.bjs-powered-by { display: none !important; }` — не привязано к теме, покрывает viewer/modeler/preview/stage (все рендер-пути используют один набор bpmn-css).
- Guard'ы контекстного меню (`.bjs-powered-by` в `resolveBpmnContextMenuTarget.js`, `shouldOpenBpmnContextMenu.js`, `wireBpmnStageRuntimeEvents.js`) НЕ трогаем — элемент остаётся в DOM.
- Тест: source-check, что правило добавлено в 02-02 (repo-идиома).

## Правка №1 — редизайн страницы входа

- `PublicHomePage.jsx`: layout «бренд-панель + карточка» на десктопе (max-lg — одна колонка), бренд-блок: логотип-иконка (inline SVG, aria-hidden), «PROCESSMAP», подзаголовок продукта; карточка с `shadow-panel` сохранена. Режимы `MODE_INVITE_ENTRY` / `MODE_INVITE_ACTIVATE` — тот же визуальный язык (заголовок карточки, структурированный summary-блок, те же контролы).
- `LoginForm.jsx`: input → класс `input h-11` (единый стиль с invite-режимами), error-блок с `role="alert"` сохранён, autofocus email сохранён. Совместимость с `LoginModal` (compact) сохранена.
- `LoginModal.jsx`: визуальный язык карточки приведён к той же композиции (без дублирования бренд-панели — это модалка).
- Сохранить: `data-testid="public-home-invite-mode-button"`, контракты onCancel/onSuccess, маппинг ошибок, autofocus.
- Строки: только существующие `ru.auth.*` + минимум новых строк в `ru.js` (бренд-подзаголовок, подписи блоков меню) — текстовые, не токены.

## Правка №3 — редизайн меню аккаунта

- Шапка: аватар-кружок с инициалами (токены `--accent`/`--fg`), имя + email, бейджи групп (`topbar-account-groups` сохранён). Добавить кнопку «Профиль (скоро)» с `data-testid="topbar-account-profile-soon"` — закрывает pre-existing красный тест на main.
- Уведомления: заголовок «Уведомления» + badge с `unviewedCount` (единый), сводка оставлена одна (под заголовком, `topbar-notification-empty` дублирующую dashed-плашку удалить — empty state = центрированная плашка с иконкой + одна строка), превью-строки: иконка типа, primary/secondary, контекст + относительное время сохранить, hover-токены `info`.
- Контролы: разделители, иконки у «Тема» и «Выйти» (inline SVG, aria-hidden), logout — danger-токены.
- Сохранить ВСЕ перечисленные `data-testid` из §4 промпта + клик-семантику.
- Тесты `TopBar.discussion-notifications.test.mjs` опираются на regex классов (`rounded-md border border-border/65 bg-panel2/30 px-2.5 py-2`, `hover:border-info/35 hover:bg-panel2/55`, `w-[360px]`, `justify-end` в header-meta) — при смене разметки обновить regex'ы осознанно, зафиксировать в PR. Pre-existing красный тест `topbar-account-profile-soon` чинится правкой №3.

## Приёмка

1. `npm test` (node --test) — зелёные (без новых красных относительно baseline; pre-existing красные зафиксировать).
2. Живой стек: `curl -I localhost:5177`, скриншоты Chrome 1440/1280/моб., обе темы, evidence/ до-после.
3. PR на русском, скриншоты, чек-лист. Merge/deploy — НЕ выполнять.
