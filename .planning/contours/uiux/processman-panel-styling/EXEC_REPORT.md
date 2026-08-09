# EXEC REPORT — uiux/processman-panel-styling

Дата: 2026-08-09. Ветка: `feat/processman-panel-styling` от `origin/main` @ 267b1ce6
(после merge #701 redesign + #702 hotfix css-импорта).
Задача: визуальный редизайн панели PROCESSMAN — **только CSS/токены**, без JSX/стор/API.

## Design system (скилл ui-ux-pro-max — обязательный первый шаг)

- **Style**: `Trust & Authority` (сдержанный B2B, WCAG AAA-ориентир; AVOID
  «AI purple/pink gradients» → градиенты не используются, только плоские тона;
  единственный linear-gradient в коде — hard-stop solid-сегмент индикатора этапов,
  визуально плоская полоса, не градиент-эстетика).
- **Palette**: slate-база скилла (#0F172A/#F8FAFC/#E2E8F0) ≈ существующие
  `--pm-tobe-*`; акцент — существующий `--pm-tobe-assistant` #6d28d9
  (skill-CTA #0369A1 не применён: конфликт с selection-синим канваса).
- **Typography**: паттерн Minimal Swiss (single-family, weight-шкала); фактические
  шрифты — продуктовые Fira Sans/Fira Code (кириллица), шкала 11/12/13px,
  заголовки 600–700, mono для имён узлов.
- **UX-гайдлайны скилла**: hover = cursor + subtle change 150–300ms; continuous
  animation только для loading; reserve space для async; контраст ≥4.5:1;
  prefers-reduced-motion; новых emoji не добавлено (✦ — существующий глиф ассистента).

## Scope (сделано)

Все правки — `frontend/src/features/process/processman/processman.css` +
3 новых токена. JSX/стор/i18n/API не тронуты (0 изменённых .jsx/.js).

**Новые токены** (`frontend/src/styles/tokens.css`, таблица Color Palette в
`design-system/processmap-to-be/MASTER.md`):
- `--pm-tobe-assistant-strong: #5b21b6` — hover/active ассистентских контролов (8.6:1 на белом);
- `--pm-tobe-shadow-pop` — тень плавающих элементов (панель-overlay <1200px);
- `--pm-tobe-shadow-lift` — hover-подъём карточек.

**Чеклист стилизации:**
1. **Шапка**: ✦-аватар — 28px плашка assistant-soft с глифом agent-цвета; статус
   с живой точкой (зелёная `--pm-tobe-accent` в ready; фиолетовая с pulse 1.2s
   при генерации `--active`).
2. **Контекст-чип**: скруглённая (10px) плашка assistant-soft с solid-рамкой
   (вместо dashed), имя узла — Fira Code, hover → underline имени + рамка
   agent-цвета (подсказка «показать на схеме» — существующий title кнопки).
3. **Quick actions**: карточки с иконкой в цветной плашке 30px (assistant-soft,
   на hover инвертируется в solid), заголовок 600, hover = подъём -1px +
   `--pm-tobe-shadow-lift` + border agent-цвета; единая сетка gap 8px.
4. **Лента**: user-пузыри вправо нейтральные (`--pm-tobe-muted`, label muted —
   убран фиолетовый); agent-карточки full-width с левой кромкой 3px
   `--pm-tobe-assistant` + soft-фиолетовый фон + аватар ✦ в solid-круге 20px;
   чипы 📍 — pill-кнопки с mono-именем, hover = solid-инверсия; индикатор
   этапов — тонкий 2px трек со скользящим solid-сегментом (1.4s);
   «Источники» — светлый инсет внутри agent-карточки.
5. **Empty state**: по центру, ✦ 22px в soft-круге 44px (CSS ::before,
   декоративный — i18n не затронут), примеры — кликабельные пилюли с hover-подъёмом.
6. **Onboarding**: карточка с рамкой/фоном assistant, шаги пронумерованы
   CSS-счётчиком (круги 18px solid), кнопка «Понятно» — primary solid violet.
7. **Composer**: focus-ring agent-цвета (border + ring 3px color-mix 22%);
   отправка — круг 40px solid violet, hover → assistant-strong, disabled →
   muted плашка (видна на скриншоте empty); дисклеймер muted 11px (как был).
8. **Микродвижение**: fade+slide 180ms (opacity+transform, 60 FPS) для новых
   сообщений; pulse точки статуса; всё отключено в `prefers-reduced-motion`.
9. **Радиусы**: скейл 8 (контролы/плашки иконок) / 10 (чип, инсеты) / 12
   (карточки, пузыри) / 999 (пилюли) — зафиксирован в шапке файла; тени —
   только плавающим элементам (pop) и transient hover-подъёму (lift).
10. **Скроллбар ленты**: тонкий 6px, thumb из color-mix(muted-fg 45%),
    track прозрачный (webkit + scrollbar-width/color для Firefox).

**Не тронуто** (регрессионные точки): `.pm-processman-layout`/`__canvas`,
`import "./processman.css"` в ProcessmanPanel.jsx, ErrorBoundary, канвас-цвета
(selection/quality/coverage/search), вся JSX-логика, i18n-строки.

## Проверки

- `node --test src/styles/pm-tobe-tokens.test.mjs` — PASS (старые токены на месте,
  контрастные пары ≥4.5:1).
- `node --test` по контуру processman — **58/58 PASS**.
- Полный suite: **2928 tests / 61 fail — побайтово = baseline origin/main**
  (сравнение списков /tmp/fails_baseline_names ↔ /tmp/fails_styling_names: identical).
- Grep по processman.css: 0 хардкод-цветов (только токены + color-mix от них).
- Ручной smoke (production build + vite preview + playwright, живой бэкенд):
  панель 380px, канвас не схлопнут, вопрос отправлен, agent-карточка отрисована.
- Скриншоты до/после: `shots/` (onboarding, empty+quick, agent-карточка, rail).

## Контраст (WCAG AA, ключевые новые пары)

- fg #0f172a на assistant-soft #ede9fe ≈ 13.7:1 (текст agent-карточек);
- assistant #6d28d9 на белом 5.9:1, на assistant-soft ≈ 4.9:1 (иконки/чипы/имена);
- assistant-strong #5b21b6 на белом ≈ 8.6:1 (hover-контролы);
- on-primary #fff на assistant #6d28d9 ≈ 5.9:1 (primary-кнопки, аватар).

## Файлы

- `frontend/src/features/process/processman/processman.css` (419 → 1173 строк: секция
  PR-1 переписана по чеклисту + restyle `__icon`/overlay-shadow)
- `frontend/src/styles/tokens.css` (+3 токена)
- `design-system/processmap-to-be/MASTER.md` (+3 строки палитры)
- `.planning/contours/uiux/processman-panel-styling/` (этот отчёт + shots/)
