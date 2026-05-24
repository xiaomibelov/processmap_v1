# UX_ACCEPTANCE_CHECKLIST — детальный чеклист приемки редизайна реестра

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
**Run ID:** `20260517T134517Z-85981`  
**Agent:** Agent 3 / Executor Part 2  
**Дата:** `2026-05-17`  
**Назначение:** спецификация UX-acceptance для runtime review.

## Раздел A — Визуальная иерархия (anti-chaos)

| # | Критерий | Ожидаемый результат | Как проверить |
|---|---|---|---|
| A.1 | Заголовок занимает верхний визуальный уровень | «Реестр действий с продуктом» виден первым; font-size >= 20px, font-weight >= 600 | Browser/DevTools на 1920x1080 |
| A.2 | Табы находятся под заголовком | Scope tabs не перекрывают title/subtitle и не выглядят как основной header | Визуальный порядок: header -> scope |
| A.3 | Scope block компактен | Workspace / Проект / Сессия читаются как контекст, а не как отдельный dashboard | Проверить selected/disabled states |
| A.4 | Метрики находятся сразу после scope | 5 counters видны без скролла: Сессий, Строк, Полных, Неполных, После фильтров | Fresh load на 1920x1080 |
| A.5 | «После фильтров» не доминирует | Counter равен по визуальному весу остальным метрикам | Сравнить размер, цвет, ширину |
| A.6 | Фильтры расположены горизонтально или grid/wrap | Нет вертикального sidebar/left stack; фильтры не толкают таблицу глубоко вниз | Проверить 1920, 1440, 1280 |
| A.7 | Таблица начинается above the fold | Верх таблицы виден на 1920x1080 без скролла | Fresh page screenshot |
| A.8 | Таблица является главным content block | После header/scope/metrics/filters именно registry table получает основной вес | Визуальная инспекция |
| A.9 | «Источники данных» отделены от таблицы | Sources section не занимает верхнюю треть экрана и не сливается с registry rows | Проверить delimiter/spacing/title |

## Раздел B — Компактность и читаемость

| # | Критерий | Ожидаемый результат | Как проверить |
|---|---|---|---|
| B.1 | Метрики-карточки компактны | padding <= 12px, ширина карточки <= 160px | DevTools computed styles |
| B.2 | Значения метрик читаемы, но не hero-sized | Values ниже по весу, чем title и table | Визуально + font-size |
| B.3 | Фильтры плотные | label + control в одной строке, высота <= 40px, корректный wrap | DevTools + resize |
| B.4 | Строки таблицы компактны | row height <= 48px без потери читабельности | Измерить `<tr>` |
| B.5 | Бейджи статуса читаемы | «Полная» / «Неполная» font-size >= 12px, контраст достаточный | Визуально/DevTools |
| B.6 | Чипы/теги не ломают строку | Не более 1 строки, длинные значения не обрезают ключевой текст | Проверить самые длинные rows |
| B.7 | Pagination относится к таблице | 25/50 и page controls визуально принадлежат table section, не sources | Визуальная инспекция |

## Раздел C — Цвета и стили (calm UI)

| # | Критерий | Ожидаемый результат | Как проверить |
|---|---|---|---|
| C.1 | Бейджи используют спокойные цвета | Не neon, не агрессивный red/green; допустимы muted slate/emerald/amber | Визуально + CSS |
| C.2 | Фон таблицы нейтральный | Белый/gray neutral, без gradient background | DevTools background |
| C.3 | Hover строк легкий | background-color shift <= 5%; нет резких эффектов | Навести на строки |
| C.4 | Warning-баннер спокойный | Yellow/amber/orange, не red, без мигания/animation | Визуально + DevTools |
| C.5 | Section delimiter не перегружен | Sources отделены spacing/background/border/divider, но не конкурируют с таблицей | Визуальная инспекция |

## Раздел D — Responsive behavior (минимум)

| # | Критерий | Ожидаемый результат | Как проверить |
|---|---|---|---|
| D.1 | 1440px usable | Header, scope, metrics, filters, table читаемы; таблица остается primary | Viewport 1440x900 |
| D.2 | 1280px filters wrap корректно | Фильтры переносятся 2-3 в строку без overlap | Viewport 1280x800 |
| D.3 | <1024px нет body horizontal scroll | Горизонтальный скролл всей страницы отсутствует | Проверить `document.body.scrollWidth` |
| D.4 | Таблица может иметь локальный scroll | Если нужен overflow-x, он только внутри table wrapper | DevTools table container |

## Раздел E — Source/session semantics

| # | Критерий | Ожидаемый результат | Как проверить |
|---|---|---|---|
| E.1 | Section title ясен | «Источники данных» или «Выбор источника» виден отдельно от table title | Визуально |
| E.2 | Project action не путается с row action | «Открыть проект»/«Загрузить из проекта» читается как source action | Визуально + click path |
| E.3 | Session action не путается с row action | «Открыть сессию»/«Загрузить из сессии» читается как source action | Визуально + click path |
| E.4 | Sources secondary | Блок ниже таблицы или визуально вторичен, не primary above fold | Fresh screenshot |

## Раздел F — Data-safety

| # | Критерий | Ожидаемый результат | Как проверить |
|---|---|---|---|
| F.1 | Метрики реальные | Агрегаты приходят из backend или показывается «—» при пустом наборе | Network response vs UI |
| F.2 | Нет fake-data паттернов | Нет `Math.random()`, `faker`, `placeholder`, `lorem ipsum` для registry data | Code search |
| F.3 | AI selected count реален | Счетчик равен числу выбранных чекбоксов | Select/unselect rows |
| F.4 | Export real rows | CSV/XLSX содержит текущие строки таблицы | Download и сравнение |
| F.5 | Статусы от backend flag | «Полная» / «Неполная» соответствуют backend-полю, не heuristic | Network response vs UI |

## Раздел G — Scope preservation

| # | Критерий | Ожидаемый результат | Как проверить |
|---|---|---|---|
| G.1 | Shell/header/global nav сохранены | Нет registry-specific redesign в AppShell/TopBar/global nav | Visual + git diff |
| G.2 | Analytics Hub сохранен | Hub открывается и остается контейнером входа в registry | Browser path |
| G.3 | Routing не менялся вне scope | Existing route semantics сохранены | Route smoke |
| G.4 | Backend/schema/BPMN/RAG не затронуты | Нет out-of-scope product/runtime mutations | git diff + Network |

**Go для reviewer:** все критичные пункты A, F, G должны пройти; B-E допускают только мелкие визуальные замечания, не возвращающие хаотичный layout.
