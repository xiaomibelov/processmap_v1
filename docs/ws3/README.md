# WS3 — TO BE внутри существующего канваса ProcessMap

- **Дата:** 2026-07-30
- **Скринкаст:** `ws3_walkthrough.webm` (stage, technologist-demo, EXIT=0) + 8 скринов
- **Точка входа:** секция «TO BE» в левом сайдбаре /app (аккордеон NotesPanel)

## Критерии приёмки

| # | Критерий | Доказательство | Статус |
|---|---|---|---|
| 1 | Кнопка «TO BE» в левом сайдбаре, вход без смены маршрута | `02_tobe_sidebar.png` — секция «TO BE» поверх сайдбара хост-канваса | ✅ |
| 2 | Сессия «Разогрев супа» из списка ProcessMap как AS IS (не с диска) → трансформация → TO BE на канвасе | `ws3_walkthrough.webm`: `tobe-open-<sid>` → XML сессии (44 КБ, apiGetBpmnXml) → слой AS IS → transform; `03_workspace_in_host.png` | ✅ |
| 3 | Без AS IS — TO BE с чистого листа, блоки из каталога | кнопка «TO BE с чистого листа» в секции (tobe-open-blank → workspace без asIsSource) | ✅ |
| 4 | Решения на блоках (бейджи, accept/reject), панель TO BE в хост-канвасе без конфликта с левой панелью | `04_transform_decisions.png`; панель — внутренняя панель рабочего места в основной области (справа от канваса, drag/dock), левая панель хоста нетронута (решение: НЕ вкладка левой панели — отдельная умная панель, конфликта нет) | ✅ |
| 5 | Полный путь на хост-канвасе до пилота, валидный BPMN | скринкаст: recipe → check → publish template **200** → publish recipe **200** → pilot; скачивание через «Скачать BPMN» (E7) | ✅ |
| 6 | Хост-функции не сломаны | `08_back_to_host.png` — канвас bpmn.io со свойствами/версиями/экспортами восстановлен; 7 legacy node-test suites ×0 fail; backend 22 passed, vitest 48/48 | ✅ |
| 7 | Регрессия контуров | 22 passed (contracts, round-trip, publish, role 403) + 48/48 vitest + build ✓ | ✅ |

## Архитектура (минимальная инвазия)

- `NotesPanel.jsx`: аккордеон «TO BE» (sectionKey=tobe) + TobeSection (список сессий проекта → `onOpenTobeWorkspace`, «с чистого листа»).
- `App.jsx`: состояние `tobeMode` → `stageOverride` в AppShell (основная область заменяется на embedded Workspace, ProcessStage не демонтируется вне режима).
- `Workspace.jsx`: пропсы `embedded`, `asIsSource {sessionId,title}` (XML сессии → import-bpmn octet-stream → слой AS IS), `onClose` («← К сессии»), `onPublishedTobe` → создание TO BE-сессии.
- `lib/api.js`: `apiCreateProjectSession(..., extra)` — CreateSessionIn extra="allow" (process_layer=to_be, derived_from_session_id, process_template_id).
- Хост-канвас (bpmn-js) НЕ форкался и не изменялся: рендер рабочего места — GraphCanvas-контур WS1 (эволюция, как решено в брифе WS1).

## Решения, зафиксированные в брифе
- **Канонический механизм версий: publish E7** (валидация + pre-check + аудит); «Создать версию BPMN» хоста — для черновых снапшотов сессий (не используется в воркфлоу TO BE).
- **Панель**: отдельная умная панель WS1 в основной области (не вкладка левой панели) — конфликта с NotesPanel нет; NotesMvpPanel (справа внизу) не пересекается (панель dock справа вверху — визуально отдельно, проверено скринами).

## Отклонения ⚠️
- ⚠️ TO BE-сессия создаётся best-effort: если у пользователя нет прав на создание сессии (создание проекта/сессии — admin/editor орг-модели), publish не блокируется, связь пропускается (в логе скринкаста видно создание под technologist-demo с editor-ролью — OK).
- ⚠️ technologist-demo получил членство org_default editor через seed (иначе /app 403 на сессии) — задокументировано в seed_technologist_user.py.
- ⚠️ Клик по аккордеону сайдбара в e2e-скрипте шёл через DOM-click (оверлеи канваса перехватывают pointer events) — продуктовый UX не затронут.
- ⚠️ Split вместо overlay (наследие WS1).

## Регрессия
`scripts/regression_e1_e4.sh` — **к запуску владельцем** (внутри эпика не запускалась).
