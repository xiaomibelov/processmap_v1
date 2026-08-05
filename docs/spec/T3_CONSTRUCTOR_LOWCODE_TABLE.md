# T3 — Лоукод-функции конструктора TO BE: таблица S/M/L

> **Каталог операций сегодня: 13 кодов** (stage, `GET /api/operation-catalog`; сид — `backend/seed_operations.py`). **14-й код — `hold`** («Выдержать»: `object_ref`, `purpose`): присутствует в `V03_PARAMETER_SCHEMA` (`seed_operations.py:347-363`), но НЕ засеян — известный гэп, лежит в backlog (сид `hold`).

Документ — только план (без кода). Каждая функция заземлена в as-built якорь.
Типы: **механика** (без LLM), **LLM** (нужен вызов модели), **гибрид**.
Приоритизация — за владельцем; реализация — отдельными эпиками по ней.

## Таблица

| # | Функция | Что уже есть (as-built) | Тип | Дубль Constructor/Workspace | Размер | Обоснование |
|---|---|---|---|---|---|---|
| 1 | **Вставка функции кликом** | Палитра → `handleAddOperation` (`Constructor.jsx:254-275`, дубль `Workspace.jsx:293`); вставка «в хвост справа» (`nextNodePosition`, `Constructor.jsx:57-62`); геометрия клика `svgPoint` (`GraphCanvas.jsx:129-151`) | механика | логика добавления продублирована → **×2**; вынос в shared-хелпер `modelUtils.js` → **S+** | **S** | Осталось: вставка в точку клика и/или в разрыв потока (`addFlow/deleteFlow` атомарны, `modelUtils.js:111-134`) |
| 2 | **Автопредложение функции по каталогу** | Каталог + `execution_contract`/`allowed_outputs` доступны (`Catalog.jsx`, opDetails lazy-load `Constructor.jsx:184-199`); LLM-инфра в main: gateway, флаг `schema_assistant` (`llmConstants.js:1`) | **LLM** (умный вариант) / гибрид | UI-кнопка в обоих экранах → **×2** | **S** (LLM-вариант — готовая приёмка LLM3 `suggest-next`, cheap-модель, ≤800 токенов, accept/reject через существующие механизмы) / **M** (механический вариант: ранжирование по совместимости outputs→condition, preconditions из execution_contract) | Эпик LLM3 в `docs/llm/PLAN.md:285`; механический вариант не требует модели вовсе |
| 3 | **Автолейаут схемы** | Layout-движка нет; BFS по графу — `computeReachable` (`modelUtils.js:254-300`); геометрия — `GraphCanvas.jsx:9-52`; применение координат — `updateNode`, viewBox пересчитается сам | механика | рендер общий (`GraphCanvas`/`OverlayGraphCanvas`) — дубль минимален, кнопка ×2 | **M** (слоистая раскладка по BFS-слоям; lanes — ограничение) / **L** (dagre/elk с обходом пересечений и lanes) | Вся механика сохранения координат уже есть; dagre/elk в зависимостях отсутствуют |
| 4 | **Инлайн-ошибки в конструкторе (v0.3)** | Частично: required-параметры (`panels.jsx:146-150`), условие развилки (`:274-279`), ⚠ недостижимых на канвасе (`GraphCanvas.jsx:306-310`); серверные findings — только в CheckPanel; `nodeBadges` готов (`GraphCanvas.jsx:295-305`); правила R1–R6+ (`docs/e6/rules_coverage.md`) | механика | CheckPanel общий, канвас общий — дубль минимален | **M** | Донести findings `/validate` на канвас через `nodeBadges` + live-проверки на onChange без кнопки «Проверить»; серверные правила уже есть |
| 5 | **Дублирование блока** | Нет (clone есть только у шаблона целиком, `Constructor.jsx:326-331`); immutable-хелперы `addNode/nextId` (`modelUtils.js:66-109`) | механика | кнопка в `BlockForm` — общий `panels.jsx:225-227`, дубля нет | **S** | Копия node с `nextId`, смещение x/y, без потоков; тривиально |
| 6 | **Чип «＋ в справочник» в конструкторе** | Механика существует в легаси-редакторе (`ElementSettingsControls.jsx:1737-1750` + тест); в `BlockForm` голый select из `declaredRefs` (`panels.jsx:121-133`); словари `/api/dictionaries/*` (`modelUtils.js:12-16`) | механика | `BlockForm` общий (`panels.jsx`) — дубля нет | **S** | Перенос существующей механики; сейчас нельзя создать сущность, не уходя во вкладку «Сущности» |
| 7 | **Поиск/фильтр и группировка палитры** | Палитра — плоский `.map` без фильтра (`Constructor.jsx:767-780`); у каталога есть `category` (`Catalog.jsx:121`) | механика | палитра продублирована (`Workspace.jsx:1416-1451`) → **×2**; вынос в shared-компонент → **S+** | **S** | При росте каталога (13 кодов сегодня → 14+ v0.3) палитра станет неюзабельной |
| 8 | **Вставка блока в середину потока (rewire)** | Разрыв + 2 связи вручную в 4 клика через connect-режим (`Constructor.jsx:221-241`); `addFlow/deleteFlow` атомарны | механика | connect-режим продублирован → **×2** | **S–M** | Композиция существующих атомарных хелперов; M — если с авто-выбором точки разрыва |
| 9 | **Undo/redo** | Все мутации модели чистые (immutable `modelUtils.js`); dirty-флаг есть (`Workspace.markDirty`) | механика | стек снапшотов uiModel — в shared, дубль снимается выносом | **M** | Снапшоты uiModel в стек. **⚠ Архитектурно влияет на ВСЕ функции вставки (1, 5, 8): рассмотреть РАНЬШЕ M-размера — если делать после них, придётся дважды трогать одни и те же mutation-точки** |

## Граница механика/LLM

LLM реально нужен только для №2 в варианте «умное предложение по смыслу»;
механический вариант №2 (совместимость по outputs/contract) жизнеспособен без
модели. Всё остальное — чистая механика на существующих immutable-хелперах.
LLM-инфра (gateway, feature flags, админка `/admin/llm`) уже в main и ждёт
фич LLM1–LLM3.

## Колонка «Дубль Constructor/Workspace» — как читать

Два экрана редактирования (`constructor/Constructor.jsx` и
`workspace/Workspace.jsx`) дублируют логику добавления блоков и палитру.
Варианты для каждой затронутой функции:

- **×2** — реализовать в обоих экранах: размер ×1.5–2, рассинхрон поведения.
- **Вынос в shared** (`modelUtils.js` / общий компонент): размер ×1.2 один раз,
  дальнейшие функции дешевле. Рекомендуется делать первым затронутым эпиком.

## Риски

- Спека (`docs/spec/WORKFLOW_TECHNOLOGIST_SPEC_V2.md`) описывает template-модель,
  а LLM-эпики строятся на сессионной — расхождение зафиксировано ⚠ в
  `docs/llm/PLAN.md`; учитывать при реализации №2.
- 14-й код `hold` не засеян — эпики, считающие каталог «14 кодов» (LLM1/LLM3
  промты), будут видеть 13 до закрытия backlog-гэпа.

## Источники as-built

`frontend/src/features/technologist/{constructor/Constructor.jsx, constructor/panels.jsx,
constructor/modelUtils.js, workspace/Workspace.jsx, graph/GraphCanvas.jsx, graph/OverlayGraphCanvas.jsx,
catalog/Catalog.jsx}`, `backend/seed_operations.py`, `backend/app/routers/operation_catalog.py`,
`docs/llm/PLAN.md` (эпики LLM1–LLM3), `docs/e6/rules_coverage.md`.
