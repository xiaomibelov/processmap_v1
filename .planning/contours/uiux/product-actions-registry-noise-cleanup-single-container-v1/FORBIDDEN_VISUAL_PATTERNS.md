# FORBIDDEN visual patterns — DOM/CSS-уровень

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`
- scope: только страница «Реестр действий с продуктом» и связанные локальные стили; глобальный shell, BPMN, dark-theme, legacy CSS — вне scope (не проверяем и не правим).

Каждый паттерн сопровождается: **(а) что запрещено**, **(б) почему**, **(в) команда `rg` или DevTools-селектор**.

## F1. Градиенты (`linear-gradient` / `radial-gradient`)

- (а) Любые `linear-gradient(...)` или `radial-gradient(...)` в `background`/`background-image` в скоупе реестра.
- (б) Спек требует плоской поверхности. Градиент использовался ранее в AI-блоке и был блокером прошлого CHANGES_REQUESTED.
- (в) grep:
  ```bash
  rg -n "linear-gradient|radial-gradient" \
    frontend/src/components/process/analysis \
    frontend/src/components/process/analysis/registry \
    frontend/src/styles
  ```
  DevTools: открыть страницу, в Elements выбрать любой элемент реестра → Computed → фильтр `gradient` (должно быть пусто).

## F2. Внутренние тени (`box-shadow` внутри контента)

- (а) Любой `box-shadow` у элементов внутри контейнера реестра.
- (б) Разрешена **только одна внешняя тень** `0 1px 3px rgba(0,0,0,0.06)` у самого primary-контейнера.
- (в) grep:
  ```bash
  rg -n "box-shadow" frontend/src/components/process/analysis \
    frontend/src/components/process/analysis/registry frontend/src/styles \
    | grep -v '0 1px 3px rgba(0, *0, *0, *0\.06)'
  ```
  DevTools: для каждой секции (Header, Workspace scope, Sessions, Metrics, Filters, Warning, AI, Table) Computed → `box-shadow:none`.

## F3. Цветные подложки у metric-блоков

- (а) Любой `background-color` отличный от `#FFFFFF`/`transparent` у блоков метрик и их обёрток.
- (б) Метрики — текстовая строка, не карточки.
- (в) grep:
  ```bash
  rg -n "background(-color)?:" frontend/src/components/process/analysis/registry/ProductActionsRegistryMetrics.jsx \
    frontend/src/styles
  ```
  DevTools: Elements выбрать metric-узел → Computed → `background-color` ∈ `{transparent, rgba(0,0,0,0), #FFFFFF}`.

## F4. `border-style: dotted | dashed`

- (а) Любые dotted/dashed бордеры в скоупе реестра.
- (б) Декоративная штриховка ломает строгость единого контейнера.
- (в) grep:
  ```bash
  rg -n "border-style:\s*(dotted|dashed)|border:[^;]*\b(dotted|dashed)\b" \
    frontend/src/components/process/analysis frontend/src/styles
  ```
  DevTools: для каждой секции Computed → `border-style` ∈ `{none, solid}`.

## F5. Цветные `border-left` / `border-right` декоративные полосы

- (а) Цветные вертикальные акцент-полосы у секций (warning, AI, metrics).
- (б) Спек запрещает цветные полосы как замену бэкграундов.
- (в) grep:
  ```bash
  rg -n "border-(left|right):\s*[0-9]+px\s+solid\s+#" \
    frontend/src/components/process/analysis frontend/src/styles
  ```
  DevTools: Computed → `border-left-width`/`border-right-width` = `0px` у секций контейнера (исключение — внутреннее разделение колонок таблицы тонкой `#F3F4F6`, если применяется).

## F6. Card-in-card

- (а) Внутренний блок одновременно имеет `border` + `border-radius` + (`box-shadow` или второй `background-color`).
- (б) Запрещено по PLAN.md §4.2; портит единую поверхность.
- (в) DevTools-селектор:
  ```js
  Array.from(document.querySelectorAll('[class*="registry"], [class*="Registry"] *'))
    .filter(el => {
      const s = getComputedStyle(el);
      return s.borderStyle !== 'none' &&
             parseFloat(s.borderRadius) > 0 &&
             (s.boxShadow !== 'none' ||
              (s.backgroundColor && !['rgb(255, 255, 255)','rgba(0, 0, 0, 0)','transparent'].includes(s.backgroundColor)));
    });
  // длина результата должна быть ≤ 1 (только сам primary-контейнер).
  ```

## F7. Жёлтая подложка / бордер у warning

- (а) `background-color` оттенков жёлтого (`#FEF3C7`, `#FFF7E6`, `#FFFBEB` как фон секции и т.п.) или цветной `border` у warning-row.
- (б) Warning должен быть текстовой строкой, не баннером.
- (в) grep:
  ```bash
  rg -n "background(-color)?:\s*#(FE|FF|fe|ff)[A-Fa-f0-9]{4}" \
    frontend/src/components/process/analysis frontend/src/styles
  ```
  DevTools: warning-row Computed → `background-color: rgba(0,0,0,0)` (или `#FFFFFF`); `border-style: none`.

## F8. Gradient или цветная подложка у AI-блока

- (а) `background-image: linear-gradient(...)`, `background-color` ≠ белого/прозрачного у AI-секции.
- (б) Ровный AI-row; цвет `#7C3AED` допустим **только** на самой кнопке «AI: предложить действия» и в активном chip-state (`#EDE9FE`/`#5B21B6`).
- (в) DevTools-селектор:
  ```js
  const ai = document.querySelector('[data-section="ai"], [class*="AI"], [class*="ai-suggestions"]');
  // допустимо: getComputedStyle(ai).backgroundImage === 'none'
  // допустимо: getComputedStyle(ai).backgroundColor ∈ {transparent, rgb(255,255,255)}
  ```

## F9. Дубли CSV / XLSX вне Header

- (а) Любая кнопка / линк с текстом `CSV` или `XLSX` или иконкой экспорта вне header-блока.
- (б) Спек требует одно место экспорта.
- (в) grep + DOM:
  ```bash
  rg -n "CSV|XLSX|export.*xlsx|export.*csv" \
    frontend/src/components/process/analysis/registry
  ```
  DevTools:
  ```js
  document.querySelectorAll('button, a').length;
  Array.from(document.querySelectorAll('button, a'))
    .filter(el => /CSV|XLSX/i.test(el.textContent || el.getAttribute('aria-label') || ''))
    .length === 2; // ровно один CSV и один XLSX
  ```

## F10. Stagger / marketing-style анимации

- (а) `@keyframes` с пер-индексной задержкой (`animation-delay: calc(var(--i) * Xms)`), `transform:scale(...)` на entrance, `slide-in`-анимации, анимированные градиенты.
- (б) PLAN.md §4.13: разрешены только row hover, button hover, chevron rotation, max-height row expansion.
- (в) grep:
  ```bash
  rg -n "animation-delay|@keyframes|stagger|fade-in|slide-in|scale-in|@keyframes\s+gradient" \
    frontend/src/components/process/analysis frontend/src/styles
  ```
  DevTools: открыть Animations panel → при перерендере таблицы новые строки не должны появляться с задержкой друг за другом.

## F11. Pill / dotted / grey-карточки на табах

- (а) `border-radius` ≥ 12px у `tab`-кнопок, `background-color` ≠ прозрачного, `border-style: dotted`.
- (б) Табы — текст + underline 2px у активного.
- (в) DevTools:
  ```js
  Array.from(document.querySelectorAll('[role="tab"], .tab, [class*="ScopeTab"]')).map(t => {
    const s = getComputedStyle(t);
    return { br: s.borderRadius, bg: s.backgroundColor, bs: s.borderStyle };
  });
  // ожидаем: borderRadius=0px, backgroundColor=transparent/white, borderStyle: none/solid
  ```

## F12. Checkbox-колонка в таблице, если AI-выбор уже идёт через chips/scope

- (а) `<th>` или первый `<td>` с `<input type="checkbox">` в registry-таблице.
- (б) Дублирующая UX-механика выбора.
- (в) grep + DOM:
  ```bash
  rg -n "type=\"checkbox\"" frontend/src/components/process/analysis/registry/ProductActionsRegistryTable.jsx
  ```
  DevTools:
  ```js
  document.querySelectorAll('table input[type="checkbox"]').length === 0;
  ```

## F13. Цвета вне согласованной палитры

- (а) Любые hex-цвета в registry-скоупе, не входящие в палитру UX_SPEC_IMPLEMENTATION_MAP.md §E.
- (б) Палитра — единственный источник цветовой правды.
- (в) grep (находит подозрительные оттенки):
  ```bash
  rg -no "#[0-9A-Fa-f]{6}" frontend/src/components/process/analysis/registry frontend/src/styles \
    | sort -u
  # Допустимый набор:
  # #F3F4F6 #FFFFFF #E5E7EB #111827 #6B7280 #9CA3AF
  # #7C3AED #10B981 #F59E0B #B45309 #FAFAFA
  # #D1D5DB #374151 #EDE9FE #5B21B6 #4B5563
  # #ECFDF5 #FFFBEB
  ```

## F14. Фейковые / demo-данные

- (а) Hardcoded строки таблицы / sessions / metrics в JSX, не загружаемые из реальных хуков.
- (б) PLAN.md §4.13: только реальные данные.
- (в) grep:
  ```bash
  rg -n "(mock|sample|demo|fixture|placeholder|fake)Data|FAKE_|DEMO_|SAMPLE_" \
    frontend/src/components/process/analysis/registry
  rg -n "const\s+\w+\s*=\s*\[\s*\{[^}]*name:" \
    frontend/src/components/process/analysis/registry/ProductActionsRegistryTable.jsx
  ```

## F15. Удаление / обход Analytics Hub

- (а) Изменения в `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx`; новые роуты, ведущие в реестр в обход Аналитики; повышение «Реестра действий» на верхний уровень навигации.
- (б) PLAN.md §2: «Аналитика» сохраняется; «Реестр» — внутренний модуль.
- (в) grep:
  ```bash
  git diff origin/main -- frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx
  rg -n "ProductActionsRegistry" frontend/src/app frontend/src/components/AppShell.jsx \
    frontend/src/components/TopBar.jsx
  ```
  DOM: путь хлебных крошек / навигации содержит `Аналитика` → `Реестр действий`.

## F16. Inline-styles c запрещёнными значениями

- (а) `style={{ background: 'linear-gradient(...)' }}`, `style={{ borderStyle: 'dotted' }}`, `style={{ boxShadow: '0 0 ...' }}` в JSX реестра.
- (б) Inline обходит CSS-проверки.
- (в) grep:
  ```bash
  rg -n "style=\\{\\{[^}]*(linear-gradient|dotted|dashed|box-shadow)" \
    frontend/src/components/process/analysis
  ```
