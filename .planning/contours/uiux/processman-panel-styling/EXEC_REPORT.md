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

## REVIEW-FIX v3 (2026-08-09, карточный UI — снято ограничение «не трогать JSX»)

Владелец: «ограничение не трогать JSX было ошибкой — карточный UI требует новой
разметки». Разрешено: JSX-структура и CSS; запрещено: логика (стор, обработчики,
API, i18n-ключи, имена пропсов). Эталон — сгенерированный прототип
`prototype.html` (утверждён владельцем скриншотом `shots/v3-prototype.png`),
перенесён 1:1 и подключён к существующим данным/обработчикам.

JSX-изменения (только разметка, вся логика и testid сохранены):
- `ProcessmanChatFeed.jsx` — agent-сообщение → карточка из трёх зон:
  header (аватар ✦ в solid-круге + подпись PROCESSMAN (существующий
  `t.buttonLabel`) + время), body (skeleton/этапы/ошибка/текст/источники/стоп),
  meta-футер (чип уверенности `--violet`, fallback-бейдж, ghost-кнопка «↻ Обновить»
  — заменила `__action` с inline-style). Время теперь в header карточки
  (testid `processman-answer-time` — только у последней, условие показа
  answer-ok не изменено: `isLast && done && !stopped && !pending && !failed`).
- `ProcessmanQuickActions.jsx` — секционный лейбл «Быстрые действия»
  (существующий `t.actionsMore`) над карточками + chevron-аффорданс «›»
  в каждой карточке (декоративный, aria-hidden).
- `ProcessmanComposer.jsx` — БЕЗ изменений: структура уже совпадала с эталоном
  (обёртка + input + send), pill-стиль реализован в CSS через `:focus-within`.

CSS (processman.css) по эталону:
- шапка 56px white surface, аватар 32px solid radius 10; футер white surface;
- agent-карточка: surface + border + border-left 3px agent + shadow-sm,
  header soft-violet с hairline-разделителем (color-mix 18%), meta-футер
  с border-top; новые классы `__header`, `__agent-name`, `__time`, `__metachip(--violet)`,
  `__ghostbtn`;
- composer: плавающая pill-плашка radius 999 (padding 6/6/6/14, surface,
  shadow-sm), focus-ring 2px violet на `:focus-within`, input внутри borderless;
- quick: `__section` (uppercase 11px muted), `__chevron` (muted → agent на hover);
- empty: ✦-маркер с soft-ореолом (`box-shadow: 0 0 0 6px assistant-soft`);
- «Источники» — muted-инсет (на белой карточке).

Проверки v3: processman 58/58 PASS (тесты НЕ потребовали правок — все testid
и поведение сохранены), tokens 4/4 PASS, полный suite: 62 fail = baseline 61 +
1 flaky `useSessionPresence heartbeats` (timing-тест, 3/3 PASS при одиночном
прогоне; к контуру отношения не имеет — изменены только файлы processman).
Smoke на production build: все состояния (onboarding, empty, chip-выбор узла,
quick hover, composer focus, agent OK/error-карточки, rail) — `shots/v3-*`.

## REVIEW-FIX v4 (2026-08-10, финальный чеклист владельца — точные размеры/состояния)

Ветка: `feat/processman-panel-visual` от актуального `origin/main`.
Скилл ui-ux-pro-max зафиксирован в v1/v2 (Style `Trust & Authority`, Palette `B2B Service`
Card #FFFFFF на Background #F8FAFC, Font `Minimal Swiss` → Fira Sans/Fira Code) — без изменений.

Дельта к чеклисту (только CSS + разметка quick-карточек + 3 i18n-ключа описаний):
1. **Шапка**: аватар ✦ 32→**28px**, radius 10→**8**; title 700→**600**; точка статуса 6→**8px**.
2. **Контекст-чип**: hover → **bg темнее на 5%** (color-mix soft 95% + assistant 5%).
3. **Quick actions**: в карточках добавлены **описания 12px muted** (заголовок 15px/600 +
   desc; новые i18n-ключи `suggestDesc`/`explainDesc`/`findIssuesDesc` — осознанное
   отступление от «не трогать i18n»: существующих строк для описаний нет);
   hover = border assistant + translateY(-1px) + **shadow-sm** (без заливки soft);
   плашка-иконка 36px radius **8**, без инверсии в solid.
4. **Empty state**: ✦-маркер 44→**40px** в **soft**-плашке (был solid-круг + ореол).
8. **Баг совместного висения онбординга и empty state**: `.pm-processman__chat-wrap:has(.pm-processman-onboarding) .pm-processman-empty { display: none }`.

Проверки v4:
- processman-suite **58/58 PASS** (вкл. i18n-parity), tokens **PASS** — логика/testid не тронуты.
- Визуальная верификация: production build + vite preview + Playwright против живого
  backend (127.0.0.1:8011), xvfb + Google Chrome для скроллбара. Скриншоты `shots/v4-*`:
  - `v4-01-onboarding` — онбординг виден, empty СКРЫТ (фикс п.8);
  - `v4-02-empty-quick` — после «Понятно»: empty + quick-карточки с описаниями;
  - `v4-03-quick-hover` — hover карточки: violet border + подъём + shadow-sm;
  - `v4-04-header` — шапка: ✦ 28px solid radius 8, 600 title, точка 8px;
  - `v4-05-composer-focus` — focus-ring 2px violet, send disabled = 40% opacity;
  - `v4-06-chip` / `v4-07-chip-hover` — чип pill 999 + hover (bg темнее, underline);
  - `v4-09-agent-card` — **реальная** error-карточка (на хосте развёрнут backend-образ
    старше worktree: `/api/llm/*` → 404, живой ответ невозможен);
  - `v4-09b-agent-answer` — OK-карточка с чипами узлов 📍 pill/mono (ответ LLM подменён
    мок-роутом; рендер и разметка реальные; узлы сессии подмешаны в payload — у старого
    backend GET session.nodes пустой даже после add_node);
  - `v4-10-collapsed` — collapse-to-icon rail 48px;
  - `v4-12-scrollbar-full` + `v4-12-scrollbar-zoom` — тонкий 6px стилизованный скроллбар
    ленты (xvfb + Chrome; в headless classic-скроллбары не рисуются).

Замеченное вне scope v4 (логика не менялась): typewriter-печать ответа медленная
(skip по клику на карточку); при быстрой серии вопросов pending-карточки могут не
резолвиться (race в chat-store); развёрнутый на хосте backend-образ отстаёт от main
(`/api/llm/*` 404, add_node → 500/409, GET session.nodes пустой).
