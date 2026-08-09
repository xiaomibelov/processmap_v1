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

## REVIEW-FIX v2 (2026-08-09, по комментарию к PR #704)

Вердикт ревью: «типографика, а не дизайн» — корневая причина: карточки/чипы
красились в `--pm-tobe-bg` (#f8fafc) = фон панели → границы элементов визуально
исчезали, оставался «текст на полотне». Палитра скилла «B2B Service» задаёт
**Card #FFFFFF на Background #F8FAFC** — введён токен `--pm-tobe-surface`
и все элементы подняты на белые поверхности; фиолетовый усилен до solid.

Источник решений (скилл ui-ux-pro-max, `/root/vendor/ui-ux-pro-max-skill`,
skill.json v2.13.0; workflow skill-content.md: Step 2 `--design-system` — выполнен):
- **Style**: `Trust & Authority` (styles.csv через `--design-system`;
  AVOID «AI purple/pink gradients» → только плоские тона);
- **Palette**: `B2B Service` (colors.csv: Primary #0F172A, Background #F8FAFC,
  **Card #FFFFFF**, Muted #E8ECF1, Border #E2E8F0; Accent #0369A1 НЕ применён —
  конфликт с selection-синим канваса, акцент = `--pm-tobe-assistant` #6d28d9);
- **Font**: `Minimal Swiss` (typography.csv: Inter/Inter, single-family weight-шкала;
  начертание перенесено на продуктовые Fira Sans/Fira Code — кириллица, self-hosted).

Новые токены v2: `--pm-tobe-surface: #ffffff`, `--pm-tobe-shadow-sm: 0 1px 3px rgba(15,23,42,.08)`.

Пункты ревью → исправление:
1. **Quick actions → карточки**: bg `--pm-tobe-surface` + shadow-sm, плашка-иконка
   **36px** radius 10 в assistant-soft, заголовок 600, hover = border
   `--pm-tobe-assistant` + translateY(-1px) + shadow-lift + инверсия плашки в solid.
2. **Контекст-чип → pill**: radius **999px**, bg assistant-soft, имя узла mono,
   крестик — в белом круге 20px (hover → solid agent).
3. **Примеры вопросов**: пилюли surface + border + shadow-sm, hover — заливка
   assistant-soft + border agent.
4. **Шапка**: аватар ✦ 28px **solid** `--pm-tobe-assistant` radius 8 (белый глиф),
   статус с зелёной точкой (`--pm-tobe-accent`; при генерации — фиолетовый пульс).
5. **Онбординг**: карточка bg surface + border (color-mix agent 35%) + shadow-sm,
   шаги — номера в solid-кругах **20px**, кнопка primary solid.
6. **Composer**: send — круг **32px** solid `--pm-tobe-assistant`, disabled =
   **opacity .4** (фиолетовый сохраняется), focus-ring **2px violet**
   (`box-shadow: 0 0 0 2px var(--pm-tobe-assistant)`); input поднят на surface.
7. **Фиолетовый виден**: solid-аватар, solid-send, violet-soft пилюля чипа,
   violet-soft заливки hover, agent-карточки с левой кромкой + soft-фоном,
   solid ✦-маркер empty state, hover-бордеры agent-цвета на всех контролах.
8. **Скилл**: SKILL.md-эквивалент (skill.json + templates/base/skill-content.md)
   открыт и сверен; конкретные имена style/palette/font — выше; скриншоты по
   каждому пункту — в `shots/` (добавлены в git через `git add -f`: политика
   `.gitignore:56 .planning/contours/**/*.png` осознанно переопределена ради
   обязательных before/after в PR) и встроены в тело PR #704.

Проверки v2: processman 58/58 PASS, tokens 4/4 PASS, suite = baseline (61 fail,
те же unrelated), smoke на production build: панель 380px, канвас цел,
чип-выбор узла кликом по канвасу («Выбран шаг: StartEvent_1»), agent-карточка
OK (noStepReply) и error-карточка (LLM недоступен на smoke-прогоне) — обе
отрисованы корректно.
