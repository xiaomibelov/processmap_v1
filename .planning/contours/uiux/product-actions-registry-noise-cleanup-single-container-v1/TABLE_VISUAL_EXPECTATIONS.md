# Table visual expectations — детальная спецификация Registry table

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`
- источник: PLAN.md §4.12, §4.13; UX_SPEC_IMPLEMENTATION_MAP.md §13.

## 1. Контейнер таблицы

- [ ] Таблица — primary content внутри единого белого контейнера; **не** обёрнута в собственный card (без своего `border + border-radius + box-shadow`).
- [ ] Между AI-row и таблицей — разделитель `1px solid #F3F4F6` full-width.
- [ ] Никаких внутренних прокручиваемых «островов»: таблица занимает доступную ширину контейнера.

## 2. Колонки 20 / 25 / 35 / 20

| # | Заголовок | Width | Align |
|---|---|---|---|
| 1 | ПРОДУКТ | 20% | left |
| 2 | ДЕЙСТВИЕ | 25% | left |
| 3 | ПРОЦЕСС / ШАГ | 35% | left |
| 4 | СТАТУС | 20% | right |

- [ ] Сумма ширин = 100%.
- [ ] Колонка «СТАТУС» — выровнена `text-align:right`; badge также прижат к правому краю.
- [ ] Никаких дополнительных колонок (нет колонки checkbox, нет колонки «Действия»/«Меню»).

## 3. Header

- [ ] `background-color:#FAFAFA`.
- [ ] `border-bottom:1px solid #E5E7EB`.
- [ ] Шрифт: `font-size:11px; font-weight:600; text-transform:uppercase; color:#6B7280; letter-spacing:0.05em`.
- [ ] Padding ячейки: `10px 24px`.
- [ ] Без `box-shadow`, без верхнего бордера, без cap-стилей.

## 4. Row (data row)

- [ ] Padding: `12px 24px`.
- [ ] `border-bottom:1px solid #F3F4F6` (тонкий нейтральный разделитель).
- [ ] `:hover` → `background-color:#FAFAFA`, `transition:background-color 0.15s`.
- [ ] Без полосатого фона (zebra), без вертикальных колоночных линий.
- [ ] Без stagger-анимации появления.

## 5. Колонка ПРОДУКТ

- [ ] Структура: `chevron + name + subtitle`.
- [ ] Chevron: `width/height:12–14px`, цвет `#9CA3AF`; ротация при раскрытии — `transform:rotate(90deg)` или эквивалент.
- [ ] Name: `font-size:14px; font-weight:500; color:#111827`.
- [ ] Subtitle: `font-size:12px; color:#6B7280`, на новой строке или с `gap:4px`.

## 6. Колонка ДЕЙСТВИЕ

- [ ] Title: `font-size:14px; font-weight:500; color:#111827`.
- [ ] Inline-tags (категория/тип/роль):
  - default: `background:#F3F4F6; color:#4B5563; border-radius:4px; padding:1px 6px; font-size:11px`.
  - highlight (значимая категория): `background:#EDE9FE; color:#5B21B6` с теми же geometry-параметрами.
- [ ] Tags не переходят на новую строку как блок; используют `display:inline-flex; gap:4px`.
- [ ] У tags нет `border`, нет `box-shadow`.

## 7. Колонка ПРОЦЕСС / ШАГ

- [ ] Name шага: `font-size:14px; font-weight:500; color:#111827`.
- [ ] BPMN code (subdued): `font-size:12px; color:#9CA3AF`. Размещён под name или справа от name через `gap:8px`.
- [ ] BPMN code не дублируется в tooltips и не подсвечивается цветом.

## 8. Колонка СТАТУС

- [ ] Badge выровнен `text-align:right`.
- [ ] Badge «Полная»: `background:#ECFDF5; color:#10B981; border-radius:9999px (или 12px); padding:2px 8px; font-size:11–12px; font-weight:500`.
- [ ] Badge «Неполная»: `background:#FFFBEB; color:#F59E0B`, та же геометрия.
- [ ] Других цветов badge **нет** (нет красного, синего, серого).
- [ ] Под badge может располагаться subtitle `12px / #6B7280` (например, дата/контекст), но не другой badge.

## 9. Row expansion (раскрытие строки)

- [ ] Триггер — клик по строке или по chevron.
- [ ] Chevron поворачивается (`transform:rotate`).
- [ ] Раскрытие: `max-height transition` (≤ 0.25s); без stagger, без scale.
- [ ] Раскрытая зона показывает **ровно 4 read-only поля** в порядке: **ID · BPMN · Сессия · Дата**.
- [ ] Поля раскрытия: `font-size:12–13px; color:#6B7280` для лейблов, `color:#111827` для значений.
- [ ] Никаких `<input>`, `contenteditable`, `<select>` в раскрытой зоне.
- [ ] Раскрытая зона не содержит дополнительных кнопок-действий, экспорта, AI-кнопок.

## 10. Типографика и ритм

- [ ] Базовая строка — `line-height:1.4–1.5`; данные не «прижаты» друг к другу.
- [ ] Числовые значения отображаются tabular (если поддерживается шрифтом), без жирности.
- [ ] Отступы внутри ячейки горизонтально кратны 24px (24/48), вертикально — 12px.

## 11. Sorting / pagination визуальные требования

- [ ] Если в header есть индикатор сортировки — нейтральный `#9CA3AF`, без цветной подсветки.
- [ ] Pagination, если присутствует, — текстовая строка под таблицей внутри того же контейнера, без card-стиля; кнопки `‹ ›` outline.
- [ ] Pagination row отделён от таблицы тем же `1px solid #F3F4F6`.

## 12. Empty / loading state таблицы

- [ ] Empty: одна строка-сообщение, центрирована, `color:#9CA3AF; font-size:13px`. Без иконок-«гигантов» и без иллюстраций-баннеров.
- [ ] Loading: skeleton-строки нейтрального цвета без анимированного градиента; альтернативно — нейтральный текст «Загрузка…».
- [ ] Empty/Loading **не** содержат demo-значений.

## 13. Запрещено в таблице (ссылка на FORBIDDEN_VISUAL_PATTERNS.md)

- F1 (gradient), F2 (внутренние тени у строк/header), F4 (dotted/dashed border), F5 (цветные border-left/right), F6 (card-in-card вокруг таблицы), F10 (stagger), F12 (checkbox-колонка), F13 (цвета вне палитры), F14 (фейковые строки).
