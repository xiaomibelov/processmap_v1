# AI- и Filter-row expectations — детальная спецификация

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`
- источник: PLAN.md §4.9, §4.11; UX_SPEC_IMPLEMENTATION_MAP.md §10, §12.

## A. AI suggestions row

### A.1 Layout

- [ ] AI-row — **одна строка** внутри единого контейнера, секция отделена от соседних `1px solid #F3F4F6` сверху и снизу.
- [ ] `display:flex; align-items:center; justify-content:space-between; gap:16px`.
- [ ] Padding секции: `12px 24px` (по общему ритму контейнера).
- [ ] Слева: label + chips (group, `gap:8px`). Справа: AI-кнопка + счётчик (group, `gap:12px`).

### A.2 Label

- [ ] Текст: `AI-предложения` (РУС).
- [ ] `font-size:12px; font-weight:600; text-transform:uppercase; color:#9CA3AF; letter-spacing:0.05em`.
- [ ] Без иконки, без бэйджа, без фона.

### A.3 Chips

- [ ] Три chip’а в порядке: `Все видимые`, `Без действий`, `Неполные`.
- [ ] Inactive: `background:#F3F4F6; color:#6B7280`.
- [ ] Active: `background:#EDE9FE; color:#5B21B6`.
- [ ] Геометрия: `border-radius:16px; height:28px; padding:4px 12px; font-size:12px`.
- [ ] У chips нет `border`, нет `box-shadow`.
- [ ] Только один chip может быть active одновременно (по логике выбора фильтра AI-области).

### A.4 AI-кнопка

- [ ] Текст: `AI: предложить действия` (РУС).
- [ ] `background-color:#7C3AED; color:#FFFFFF; border-radius:8px; height:32px; padding:0 16px; font-size:13px; font-weight:500`.
- [ ] `:hover` — допустимо лёгкое затемнение `#6D28D9`/`#5B21B6` (через `transition: background-color 0.2s`); без gradient, без glow, без scale.
- [ ] `:disabled` — `opacity:0.6` и `cursor:not-allowed`; цвет фона тот же, без вторичной палитры.

### A.5 Счётчик

- [ ] Текст: `Выбрано для AI: N / 10`.
- [ ] При `N === 0`: `font-size:13px; color:#9CA3AF`.
- [ ] При `N > 0`: тот же шрифт, но `color:#7C3AED`.
- [ ] Счётчик — текст, без бэкграунда, без бордера.

### A.6 Запреты для AI-row

- [ ] Нет `linear-gradient`/`radial-gradient` в `background`/`background-image` секции.
- [ ] Нет цветной подложки секции (background — `transparent` / `#FFFFFF`).
- [ ] Нет `border` секции, нет `border-radius` обёртки, нет `box-shadow`.
- [ ] Нет иконки-«магической палочки» рядом с лейблом (если её нет в спеке).
- [ ] Нет дополнительных AI-кнопок (`Очистить`, `Сбросить AI`) как primary — только текст-линки при необходимости.

## B. Filters row

### B.1 Layout

- [ ] Filters — **одна компактная строка** внутри контейнера; разделители выше/ниже — `1px solid #F3F4F6`.
- [ ] `display:flex; align-items:center; flex-wrap:wrap; gap:8px`.
- [ ] Padding секции: `12px 24px`.
- [ ] Порядок селекторов: **Группа · Товар · Тип · Этап · Категория · Роль · Полнота**.
- [ ] Нет блока «Применённые фильтры» в виде цветных chip-карточек ниже строки.

### B.2 Селектор (одиночный)

- [ ] `min-width:110px; height:34px`.
- [ ] `border:1px solid #E5E7EB; border-radius:6px`.
- [ ] `font-size:13px; color:#111827`; placeholder/inactive — `#9CA3AF`.
- [ ] `background-color:#FFFFFF`.
- [ ] Стрелка-индикатор: `width/height:12px; color:#9CA3AF`, расположена справа.
- [ ] У селектора нет `box-shadow`, нет двойной рамки, нет цветной активной обводки (focus — допустим `outline` нейтрального тона или `border-color:#9CA3AF`/`#7C3AED` без `box-shadow`).

### B.3 «Сбросить фильтры»

- [ ] **Только text-link**, не кнопка с рамкой.
- [ ] `font-size:13px; font-weight:500; color:#6B7280`.
- [ ] `:hover` — `text-decoration:underline; color:#374151`.
- [ ] Без `background`, `border`, `border-radius`, `padding` уровня кнопки.
- [ ] Положение: после последнего селектора с `margin-left:16px` (или внутри той же flex-строки с `gap:16px`).

### B.4 Helper-text

- [ ] Текст: `Фильтры применяются к загруженным строкам.`
- [ ] `font-size:12px; color:#9CA3AF`.
- [ ] Размещение: на той же строке (если хватает места) или отдельной строкой ниже селекторов с `margin-top:4px`.
- [ ] Без иконки info/warning рядом.

### B.5 Поведение при применении

- [ ] При выборе значений селекторов фильтрация применяется к уже загруженным строкам (без дополнительных GET/POST вне необходимого).
- [ ] Активные значения **не** подсвечиваются цветной заливкой селектора; единственный визуальный признак — выбранное значение в селекторе.
- [ ] «Сбросить фильтры» снимает все значения за один клик.

### B.6 Запреты для Filters-row

- [ ] Нет цветных chip-блоков «Применённые фильтры» как самостоятельной row.
- [ ] Нет «framed» reset-button (с border + radius + padding).
- [ ] Нет анимаций (slide-in / fade) при применении фильтра.
- [ ] Нет иконок цветной семантики (зелёных/оранжевых) внутри селекторов.

## C. Взаимодействие AI-row ↔ Filters-row ↔ Table

- [ ] Изменение фильтров обновляет таблицу и метрики, но **не** меняет AI-выбор: счётчик `Выбрано для AI` сохраняется.
- [ ] Активный chip AI-row («Все видимые», «Без действий», «Неполные») — независимый от фильтров slice; его смена не сбрасывает Filters.
- [ ] Reset «Сбросить фильтры» **не** очищает AI-chips и AI-счётчик.
- [ ] Между AI-row и Filters-row нет card-обёртки, нет общей цветной рамки; обе секции — равноправные строки внутри контейнера.
