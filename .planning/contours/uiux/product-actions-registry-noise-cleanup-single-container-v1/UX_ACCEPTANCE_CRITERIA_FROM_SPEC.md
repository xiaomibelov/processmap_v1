# UX Acceptance Criteria — runtime-проверяемый чек-лист по разделам спека

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`
- источник дизайна: PLAN.md §4 + UX_SPEC_IMPLEMENTATION_MAP.md §C
- формат: каждый пункт измеримо в DOM/CSS/runtime, проверяется как yes/no.

> Применять при открытом разделе **«Аналитика → Реестр действий с продуктом»** на `http://clearvestnic.ru:5180/?cb=<timestamp>` со свежим браузерным контекстом.

## §1. Header

- [ ] Заголовок ровно «Реестр действий с продуктом», `font-size:18px; font-weight:700; color:#111827`.
- [ ] Subtitle присутствует одной строкой, `font-size:13px; font-weight:400; color:#6B7280; margin-top:4px`.
- [ ] Ссылка «Вернуться» одна, `font-size:13px; color:#6B7280`; на `:hover` цвет `#374151`.
- [ ] CSV/XLSX — outline-кнопки `height:32px`, `border:1px solid #D1D5DB`, без `background-color`.
- [ ] CSV и XLSX встречаются в DOM страницы реестра **ровно один раз** каждая.
- [ ] Под header проходит разделитель `border-bottom:1px solid #E5E7EB`.

## §2. Scope tabs (Workspace / Проект / Сессия)

- [ ] Три таба видны в указанном порядке.
- [ ] Шрифт табов `font-size:13px; font-weight:500`.
- [ ] Неактивные табы — `color:#9CA3AF`, без `background-color` и без `border-radius` pill-формы.
- [ ] Активный таб — `color:#111827` + `border-bottom:2px solid #7C3AED`.
- [ ] Нет `border-style:dotted|dashed` ни на одном табе.
- [ ] Нет вложенных «карточек» вокруг табов (нет `border + border-radius + box-shadow`).

## §3. Container (единый белый контейнер)

- [ ] Между блоком табов и контейнером расстояние ровно 16px (`margin`/`gap`).
- [ ] На странице ровно **один** видимый primary-контейнер вокруг секций реестра.
- [ ] Контейнер: `background:#FFFFFF; border:1px solid #E5E7EB; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.06); padding:0`.
- [ ] Внутренние секции разделены `1px solid #F3F4F6` на всю ширину контейнера (full-bleed разделитель, без отступов слева/справа от линии).
- [ ] Внутри контейнера нет card-in-card: ни одна секция не имеет одновременно `border + border-radius + box-shadow`.

## §4. Workspace scope (collapsible)

- [ ] По умолчанию секция свёрнута (collapsed).
- [ ] В свёрнутом состоянии видна одна строка: chevron-иконка + текст вида `Workspace scope · N сессий, M строк`, шрифт `13px / 500 / #374151`.
- [ ] Клик по строке раскрывает секцию; chevron поворачивается (изменение `transform:rotate`).
- [ ] Раскрытие — без stagger-анимации, плавный переход (`transition` ≤ 0.2s).
- [ ] N и M — реальные значения; при отсутствии данных строка показывает 0/0, без фейковых.

## §5. Sessions workspace

- [ ] Слева заголовок «Сессии workspace», справа компактная сводка вида `Всего: N, без действий: M` цвета `#9CA3AF`.
- [ ] Строки сессий — flex/inline, **не** табличная вёрстка с фиксированным border-grid.
- [ ] Шрифт строк `font-size:12–13px`.
- [ ] В каждой строке присутствуют (если данные есть): checkbox 14×14, project/session short ID, UUID, имя проекта, путь, кол-во действий, draft-статус, дата.
- [ ] Кнопка «Открыть проект» — outline (без `background-color`).
- [ ] Кнопка «Открыть сессию» — `background-color:#7C3AED`, `color:#FFFFFF`.
- [ ] Нет дублирующего CSV/XLSX внутри Sessions workspace.

## §6. Metrics

- [ ] Метрики представлены **одной текстовой строкой** flex `gap:32px`.
- [ ] У каждого metric-блока `background-color` равен `transparent`/`#FFFFFF` (нет цветной подложки).
- [ ] У metric-блоков нет `border`, `border-radius`, `box-shadow`.
- [ ] Между метриками нет вертикальных разделителей (никаких `border-left`/`border-right`).
- [ ] Число — `font-size:20px; font-weight:700; color:#111827`.
- [ ] Лейбл — `font-size:11px; font-weight:500; text-transform:uppercase; color:#9CA3AF`, отделён от числа `gap:4px` (справа от числа).
- [ ] Число «неполных» — `color:#F59E0B`.
- [ ] «После фильтров» при равенстве полному значению визуально не доминирует (тот же стиль, без выделения).

## §7. Filters

- [ ] Фильтры — одна компактная строка: Группа · Товар · Тип · Этап · Категория · Роль · Полнота.
- [ ] Селектор: `min-width:110px; height:34px; border:1px solid #E5E7EB; border-radius:6px; font-size:13px`.
- [ ] Стрелка селектора `12px`, цвет `#9CA3AF`.
- [ ] Расстояние между селекторами `gap:8px`.
- [ ] «Сбросить фильтры» — **text-link**, `font-size:13px; font-weight:500; color:#6B7280`, на `:hover` подчёркивание (`text-decoration:underline`); без `background`, без `border`.
- [ ] Помещается слева от селекторов с `margin-left:16px` относительно последнего селектора (или по спеку с `margin-left:16px`).
- [ ] Helper-текст «Фильтры применяются к загруженным строкам.» — `font-size:12px; color:#9CA3AF`.

## §8. Warning row

- [ ] Warning — **строка**, не баннер.
- [ ] У warning-блока нет `background-color` отличного от белого/прозрачного.
- [ ] У warning-блока нет `border`, нет `border-radius`, нет `box-shadow`.
- [ ] Иконка `width/height:14px; color:#F59E0B`.
- [ ] Текст warning — `font-size:13px; color:#B45309`.
- [ ] Справа линк «Показать только неполные» — `font-size:13px; font-weight:500; color:#7C3AED`.
- [ ] Раскладка `display:flex; align-items:center; justify-content:space-between`.

## §9. AI suggestions

- [ ] Слева label «AI-предложения» — `font-size:12px; font-weight:600; text-transform:uppercase; color:#9CA3AF; letter-spacing:0.05em`.
- [ ] Chips («Все видимые», «Без действий», «Неполные»): inactive `background:#F3F4F6; color:#6B7280`; active `background:#EDE9FE; color:#5B21B6`; `border-radius:16px; height:28px; padding:4px 12px; font-size:12px`.
- [ ] Кнопка `AI: предложить действия` — `background:#7C3AED; color:#FFFFFF; border-radius:8px; height:32px; font-size:13px`.
- [ ] Счётчик «Выбрано для AI: 0 / 10» — `font-size:13px; color:#9CA3AF`; при значении > 0 — `color:#7C3AED`.
- [ ] Секция AI **не имеет** `linear-gradient`/`radial-gradient` ни в `background`, ни в декоре.
- [ ] У AI-секции нет цветной подложки, кроме самой кнопки `#7C3AED`.

## §10. Registry table

- [ ] Таблица — primary content страницы (визуально доминирующий блок ниже AI).
- [ ] **Нет** колонки checkbox в `<thead>`/`<tr>`, если AI-выбор реализован через chips/scope.
- [ ] Заголовок таблицы: `background-color:#FAFAFA; border-bottom:1px solid #E5E7EB; font-size:11px; font-weight:600; text-transform:uppercase; color:#6B7280; letter-spacing:0.05em; padding:10px 24px`.
- [ ] Колонки: ПРОДУКТ 20% · ДЕЙСТВИЕ 25% · ПРОЦЕСС / ШАГ 35% · СТАТУС 20% (right-aligned). Сумма = 100%.
- [ ] Row: `padding:12px 24px; border-bottom:1px solid #F3F4F6`.
- [ ] Hover row: `background-color:#FAFAFA; transition:background-color 0.15s`.
- [ ] Колонка ПРОДУКТ: chevron + `name 14px/500 #111827` + subtitle `12px/#6B7280`.
- [ ] Колонка ДЕЙСТВИЕ: title `14px/500 #111827` + inline-tags (`background:#F3F4F6; color:#4B5563; border-radius:4px; padding:1px 6px; font-size:11px`); highlight-tag — `background:#EDE9FE; color:#5B21B6`.
- [ ] Колонка ПРОЦЕСС/ШАГ: name `14px/500` + BPMN code `12px/#9CA3AF` (subdued).
- [ ] Колонка СТАТУС: badge выровнен `text-align:right`; bg `#ECFDF5` text `#10B981` (Полная) или bg `#FFFBEB` text `#F59E0B` (Неполная); subtitle `12px/#6B7280`.

## §11. Row expansion

- [ ] Клик по строке поворачивает chevron (`transform:rotate`).
- [ ] Раскрытие выполнено через `max-height transition`, без resizing/stagger.
- [ ] Внутри раскрытия — 4 read-only колонки в порядке: ID · BPMN · Сессия · Дата.
- [ ] Поля раскрытия не редактируемы (нет `<input>`, `contenteditable`, `<select>`).

## §12. Empty state

- [ ] Когда данных нет, таблица показывает корректное пустое состояние без demo/seed-строк.
- [ ] Метрики при пустом наборе показывают `0`, лейблы те же; «неполных» при `0` — нейтральный цвет (`#111827` через тот же стиль числа, либо `#9CA3AF`-приглушение по реализации, но **не оранжевый**, если значение `0`).
- [ ] Sessions workspace при пустом состоянии не подставляет фейковых сессий.
- [ ] Workspace scope по-прежнему collapsible; счётчик показывает `0 сессий, 0 строк`.

## §13. Animations

- [ ] Допустимые: row hover `0.15s`, button hover `0.2s`, chevron rotation, max-height row expansion.
- [ ] Запрещены: stagger row appearance, marketing entrance, scale/slide-in, animated gradients, любые `@keyframes` с задержкой по индексу строки.

## §14. Data safety (источники данных и побочные эффекты)

- [ ] При просмотре страницы и навигации в DevTools Network нет запросов `PUT`/`PATCH`/`DELETE` (страница read-only при просмотре).
- [ ] Нет фейковых строк / sample-данных / placeholder-строк, отрендеренных как реальные.
- [ ] BPMN XML, Product Actions durable truth, RAG runtime, схема БД не модифицируются по факту просмотра реестра (по diff и по сети).

## §15. Version row

- [ ] В DOM присутствует видимая метка версии страницы / build-info, значение прочитано из `frontend/src/config/appVersion.js`.
- [ ] Значение версии инкрементировано относительно предыдущего commit (patch-bump).
- [ ] Метка версии не перекрывает основной контент.

## §16. Analytics IA preservation

- [ ] В верхней навигации виден раздел **«Аналитика»**.
- [ ] Внутри Аналитики доступны: «Реестр действий», «Реестр свойств», «Дашборды».
- [ ] Переход «Аналитика → Реестр действий с продуктом» открывает целевую страницу.
- [ ] Кнопка «Вернуться» возвращает в Analytics Hub (а не на корневой dashboard / explorer).
- [ ] «Реестр действий» **не** поднят на верхний уровень навигации (не равноправен с «Аналитика»).
