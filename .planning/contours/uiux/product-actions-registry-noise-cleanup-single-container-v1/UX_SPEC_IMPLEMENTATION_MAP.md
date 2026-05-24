# UX Spec → ProcessMap Implementation Map

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`

Этот файл — однозначный перевод спека из задания в реальные файлы и acceptance-criteria ProcessMap.

## A. Mapping разделов спека на файлы реестра

| Раздел спека | Целевой файл | Что меняем |
|---|---|---|
| §4 Header (title/subtitle/Вернуться/CSV/XLSX) | `frontend/src/components/process/analysis/registry/ProductActionsRegistryHeader.jsx` | Унифицировать в один header-блок; убрать дубли CSV/XLSX из других секций. |
| §5 Scope tabs | `ProductActionsRegistryPage.jsx` или внутри Header | Workspace/Проект/Сессия, active underline 2px `#7C3AED`, inactive `#9CA3AF`. |
| §6 Контейнер | `ProductActionsRegistryPanel.jsx` | Один белый контейнер: radius 12, border `#E5E7EB`, shadow `0 1px 3px rgba(0,0,0,0.06)`, padding 0. Все секции внутри + `1px solid #F3F4F6` divider. |
| §7 Workspace scope (collapsible) | `ProductActionsRegistryPanel.jsx` (или новый локальный sub-section) | Default collapsed; chevron + строка `Workspace scope · N сессий, M строк`. |
| §8 Sessions workspace | существующий sessions sub-component внутри `registry/` (если есть) либо локальная секция Panel | Compact flex rows, без border-table вида. Кнопки «Открыть проект» (outline) и «Открыть сессию» (bg `#7C3AED`). |
| §9 Metrics | `registry/ProductActionsRegistryMetrics.jsx` | Превратить из карточек в **одну текстовую строку** flex gap 32. Без подложек. Только число «неполных» `#F59E0B`. |
| §10 Filters | `registry/ProductActionsRegistryFilters.jsx` | Одна компактная строка селекторов 34px, ссылка-«Сбросить фильтры», helper-text. Удалить framed reset-кнопку, цветные подсветки applied-filters. |
| §11 Warning row | внутри Panel или существующего warning-блока | Текстовая строка, иконка `#F59E0B` + текст `#B45309` + правый линк `#7C3AED`. Снять жёлтую подложку и border. |
| §12 AI suggestions | существующий AI-блок реестра | Одна строка без градиента/подложки. Label + chips + кнопка `#7C3AED` + счётчик. |
| §13 Registry table | `registry/ProductActionsRegistryTable.jsx` | 4 колонки 20/25/35/20, header `#FAFAFA` 11/600 uppercase, row hover `#FAFAFA`, badges зелёный/оранжевый, expansion 4-col read-only. |
| §14 Ритм отступов | CSS в `frontend/src/styles/*` локально к реестру | Padding 24/12; разделители 1px `#F3F4F6` full-width; 16px между tabs и контейнером. |
| §15 Анимации | целевые компоненты | Row hover 0.15s, button hover 0.2s, chevron rotate, max-height expansion. Никаких stagger. |
| §16 Данные | data hooks реестра | Без фейков; пустое состояние при отсутствии данных. |

## B. Что **нельзя** трогать

- `ProcessAnalyticsHub.jsx` — Analytics shell.
- `AppShell.jsx`, `TopBar.jsx`, `WorkspaceExplorer.jsx`, `ProcessStage.jsx`, `BpmnStage.jsx`, `InterviewStage.jsx` — глобальный shell.
- BPMN CSS / dark-theme CSS / legacy CSS — стилевые правки только в скоупе реестра.
- Backend, schema, BPMN XML, Product Actions durable truth, RAG runtime, AI-логика.

## C. Acceptance criteria (точные, runtime-проверяемые)

1. Открыть `Аналитика → Реестр действий с продуктом` на :5180. Analytics-меню/Hub присутствуют.
2. Видимая иерархия: Header → Scope tabs → 16px gap → один белый контейнер с 7 секциями.
3. CSV/XLSX отображаются **ровно один раз** (в header).
4. Scope tabs: активная вкладка имеет underline 2px фиолетового цвета; неактивные серые; без pill/dotted/cards.
5. Workspace scope по умолчанию свёрнут; chevron-индикатор; раскрытие по клику.
6. Sessions workspace выглядит как компактный список, **не** как таблица.
7. Metrics — **одна текстовая строка**, без подложек/карточек. Числа 20/700 `#111827`, лейблы 11/uppercase `#9CA3AF`, «неполных» оранжевое.
8. Filters — одна компактная строка селекторов; reset — **text-link**, не framed-кнопка; helper-text 12/`#9CA3AF`.
9. Warning — текстовая строка, **без жёлтой подложки и border**; иконка + текст + правый линк.
10. AI suggestions — **без gradient/background**, label + chips + кнопка; AI-кнопка единственный `#7C3AED`-фон в секции.
11. Registry table — primary content. Header `#FAFAFA`, hover `#FAFAFA`, badge только зелёный/оранжевый.
12. Раскрытие строки: chevron поворачивается, expansion с max-height transition, 4 read-only поля.
13. Empty state корректен (нет фейковых строк).
14. Версия страницы / build-info обновлены; в DOM-метке версии видно новый патч.
15. В консоли браузера — нет ошибок при навигации и раскрытии.
16. Нет неподписанных PUT/PATCH/DELETE при просмотре/навигации.

## D. Версионная политика

- `frontend/src/config/appVersion.js` — bump patch (или соответствующее поле). Worker 2 фиксирует proof в `VERSION_UPDATE_LEDGER_PROOF.md`.

## E. Полная палитра-сводка для compliance

```
#F3F4F6  page bg / dividers
#FFFFFF  container
#E5E7EB  container border / selector border
#111827  primary text / metric number
#6B7280  secondary text
#9CA3AF  tertiary text / metric label / BPMN code
#7C3AED  AI bg / active underline / hover links
#10B981  badge Полная text  on #ECFDF5
#F59E0B  badge Неполная text on #FFFBEB / warning icon / incomplete number
#B45309  warning text
#FAFAFA  row hover / table header bg
#D1D5DB  CSV/XLSX outline border
#374151  «Вернуться» hover
#EDE9FE/#5B21B6  active chip / highlight tag
#4B5563  default tag text
```

Никаких других цветов в скоупе реестра.
