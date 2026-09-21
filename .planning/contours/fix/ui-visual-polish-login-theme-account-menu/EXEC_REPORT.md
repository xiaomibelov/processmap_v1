# EXEC_REPORT — fix/ui-visual-polish-login-theme-account-menu

> Роль: Agent 2 (Executor). Дата: 2026-09-22.
> Ветка: `fix/ui-visual-polish-login-theme-account-menu` от `origin/main` (c5db40a9).
> Скоуп: frontend-визуальный слой + дефолт темы. Diff бэкенда = 0. API-контракты не менялись.

## Что закрыто (4 правки)

### №2 — светлая тема по умолчанию
- `frontend/src/lib/theme.js` (новый): `THEME_STORAGE_KEY`, `resolveInitialTheme(stored)` (дефолт `light`, `dark` только при явном выборе), `applyInitialTheme(root, stored)`.
- `frontend/src/main.jsx`: FOUC-инициализация до рендера через `applyInitialTheme`; ветка `catch` → `light`.
- `frontend/src/components/TopBar.jsx`: `uiTheme` инициализируется lazy из фактического класса `document.documentElement` (catch → `light`); запись в localStorage через единый константный ключ.
- Сохранённое `fpc_theme=dark` продолжает открывать тёмную тему (проверено перезагрузкой).

### №4 — логотип bpmn.io скрыт
- `frontend/src/styles/app/02/02-02-bpmn-viewer-core.css`: `.bjs-powered-by { display: none !important; }` — правило не привязано к теме, покрывает viewer/modeler/preview/diff/stage (единый набор bpmn-css на все рендер-пути).
- Guard'ы контекстного меню (`resolveBpmnContextMenuTarget.js`, `shouldOpenBpmnContextMenu.js`, `wireBpmnStageRuntimeEvents.js`) не тронуты — элемент остаётся в DOM.

### №1 — редизайн страницы входа
- `frontend/src/features/auth/PublicHomePage.jsx`: раскладка «бренд-панель + карточка» (md+: две колонки; мобильная: компактный бренд-хедер над карточкой). Бренд: логотип `/favicon.svg`, PROCESSMAP, оверлайн «Food Process Copilot», теглайн, 3 пункта возможностей. Режимы `MODE_INVITE_ENTRY` / `MODE_INVITE_ACTIVATE` приведены к тому же языку (errors с `role="alert"`).
- `frontend/src/features/auth/LoginForm.jsx`: поля на едином классе `input h-11` (focus-ring и error-ring дизайн-системы); поведение (autofocus email, отправка, маппинг ошибок, контракты onSuccess/onCancel, `data-testid="public-home-invite-mode-button"`) сохранено. Совместимость с `LoginModal` и `LoginPage` (оба потребителя) сохранена.
- `frontend/src/features/auth/LoginModal.jsx`: карточка приведена к тому же визуальному языку (без бренд-панели — модалка).
- `frontend/src/shared/i18n/ru.js`: новые строки `auth.brandName/brandOverline/brandTagline/brandFeature*/profileSoon*`.

### №3 — меню аккаунта
- Шапка: аватар с инициалами (`userInitials`), имя, email (скрыт при совпадении с именем), бейджи групп (`topbar-account-groups`), кнопка «Профиль · скоро» (`data-testid="topbar-account-profile-soon"` — закрывает pre-existing красный тест).
- Уведомления: заголовок + badge непрочитанных (`unviewedCount`), сводка только при наличии уведомлений (дубль «Нет уведомлений» убран), строки-превью с иконкой колокола, контекстом, бейджем и относительным временем (`formatNotificationTime`), hover-токены `info`. Единый empty state: иконка + одна строка.
- Контролы: иконки (тема — солнце, выход — logout), разделитель, logout на danger-токенах.
- Все `data-testid` из постановки сохранены; клик-семантика (центр уведомлений, тема, logout) не изменена; `DiscussionNotificationCenterPanel` не перерабатывался.

## Токены
Новых цветов/шрифтов нет — только существующие HSL-токены (`--accent`, `--info`, `--danger`, `--panel2`, `--border`, `--muted`, `--fg`) и семантические tailwind-классы. Рекомендации ui-ux-pro-max (палитра black+gold, Cormorant/Montserrat) сознательно отклонены как вне токенов дизайн-системы.

## Версия
`frontend/src/config/appVersion.js` → v1.0.150, changelog-запись добавлена (конвенция «версия растёт с каждым контуром»).

## Проверки
- Сборка `npm run build` — зелёная (×3).
- Тесты: +7 новых зелёных; Δ к baseline = +1 pass / −1 fail / 0 регрессий (см. TESTS.md).
- Живой рендер (preview :5198 + API :8011): 15 скриншотов в `evidence/`, обе темы, 1440/1280/390, watermark `display=none` в обеих темах.

## Инфраструктурные заметки (вне диффа контура)
- Локальный RAG-индекс был случайно перезаписан пустым при отладке reindex (exit 137 OOM в docker из-за лимита VM 8.3G при занятом стеке wt-canvas-move-di-desync-409-tracker). Восстановлен полностью: manifest через docker, билд индекса на host node (16GB heap) → 71031 чанков. `pm-task-init.sh` — OK.
- Локальный dev-стек (`processmap_v1-*`) не поднимался: порты 5177/8011 заняты стеком wt-canvas-move-di-desync-409-tracker; верификация выполнена production-сборкой из worktree на :5198 с прокси на :8011. В dev-режиме (vite dev) зафиксирован шторм переимпортов модулей — воспроизводится на чистом origin/main, не является регрессией контура.

## Осталось / риски
- Merge/deploy — только владельцем после approve. Агент останавливается на открытом PR.
- Pre-existing красные тесты (~77 файлов на main) вне скоупа; описаны в TESTS.md.
