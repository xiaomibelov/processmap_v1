# AUDIT_REPORT — audit/tobe-diff-keys-v1

**Роль:** Executor. **Тип контура:** audit. **Дата:** 2026-09-16. **Режим:** строго read-only (БД — только SELECT; product code не менялся; merge/push/PR/deploy не выполнялись).

## 0. Runtime/source truth

```
pwd                        /Users/mac/agents_place/kimi_PM/p0-work-audit-dbplane
git remote -v              origin git@github.com:xiaomibelov/processmap_v1.git (+ graphify)
git branch --show-current  audit/db-plane-measures-20260916
git rev-parse HEAD         ae91569b31f0470935ef426a16c7242a1da12dbb
git rev-parse origin/main  ae91569b31f0470935ef426a16c7242a1da12dbb   (HEAD == origin/main)
git status -sb             ## audit/db-plane-measures-20260916...origin/main (чисто)
git diff --name-only       (пусто)   git diff --cached --name-only (пусто)
```

intended == served: worktree на актуальном origin/main, дрейфа нет.

**DB-plane substitution:** прямого доступа к prod-БД нет (SSH вне скоупа аудита). Все замеры выполнены на локальном снимке `processmap` в docker-контейнере `processmap_v1-postgres-1` (1789 сессий: 1787 as_is / 2 to_be; 578 org_id; данные до 2026-09-15). Запрос брифа «N≥50 prod-схем» выполнен как «50+ схем из снимка, разные проекты/org».

**EVIDENCE GAP (на старте, подтверждено):** материалы контура из брифа — `INTERIM_REPORT.md`, `DIFF_CLASSES_SPEC.md` (v1), fixtures `soup-asis.bpmn` ↔ `soup-tobe.bpmn` — в окружении ОТСУТСТВУЮТ (поиск по workspace ничего не нашёл). Контекст брифа (контентное сопоставление AS IS↔TO BE неработоспособно: 0/14 exact match, сжатие 94→18 узлов, 50/61 задач без наследника) принят как данность, не как локально проверенный факт.

## 1. Provenance persistence (главный вопрос)

### 1.1. Что показывают данные

Обе to_be-сессии снимка (полные выборки всех полей):

| id | title | project | org | derived_from_session_id | version | bpmn_meta_json | interview_json | bpmn_xml |
|---|---|---|---|---|---|---|---|---|
| 34ddc5a40f | TO BE overlay test | d7d6689637 | org_default | **b01bb10549** | 2 | {} | {} | **пусто (0 байт)** |
| edbeb21c98 | TO BE from empty | d7d6689637 | org_default | **cee3891a54** | 2 | {} | {} | **пусто (0 байт)** |

Источники: b01bb10549 «phase5 llm3» (as_is, XML 3946 байт: 2 extensionElements с `camunda:properties`/`equipment`, НЕТ zeebe/pm:/derived), cee3891a54 «empty AS IS» (XML пуст). В `session_state_versions` записей для to_be-сессий нет — диаграмма в них никогда не сохранялась.

**Парсинг XML-плоскости:** поскольку bpmn_xml to_be пуст, следов zeebe:properties/extensionElements/`derived_from`/`pm:*` в XML to_be на снимке нет в принципе. EVIDENCE GAP: выживание provenance именно внутри XML после save TO BE на данным снимке ненаблюдаемо.

### 1.2. Где физически хранится связь (код)

- **Таблица/поле:** `sessions.derived_from_session_id` (`backend/app/models.py:113`; миграция-столбец в `domains/storage/compat/repository.py:1182`). Это **связь уровня сессии** (AS IS session id → TO BE session id), не per-element.
- **Создание:** `backend/app/projects.py:400-414` (atomic create: `process_layer`+`derived_from_session_id` одним INSERT; fallback-путь 454-455) и `backend/app/routers/explorer.py:1324-1339` (create-in-project: attach после base create). Фронт передаёт поля: `frontend/src/App.jsx:1812,3823`, `frontend/src/lib/api.js:170` (extra="allow").
- **Per-element provenance:** backend-конвейер `transformation/pipeline.py` строит draft-узлы с `derived_from: [as_is_id]` (строки 347, 453, 531) и `trace_map`, но эти структуры живут только во фронтовом стейте `Workspace.jsx:102,556-560` и overlay-графе (`features/technologist/graph/overlay.js`). **Ни один путь сохранения не сериализует их в durable-хранилище:** `PUT /api/sessions/{id}/bpmn` кладёт клиентский XML as-is (`backend/app/_legacy_main.py:4710` `s.bpmn_xml = xml`), PATCH (`backend/app/sessions_core.py:308` + `services/session_service.py:1153`) обрабатывает только title/roles/notes/interview/nodes/edges/questions/bpmn_meta/status. Пространство `pm:` в XML используется только для `pm:RobotMeta` (`frontend/.../robotmeta/robotMeta.js`, `camundaExtensions.js`) — trace/provenance-элементов нет.

### 1.3. Переживает ли связь правки и повторные save

**Да (сессионный уровень).** `derived_from_session_id` пишется только при create; ни `bpmn_save`/`operations_apply` (`_legacy_main.py:4970`), ни `patch_session` (`sessions_core.py`) его не трогают. Данные это подтверждают: обе to_be имеют version=2 (были правки метаданных), связь на месте. Explorer-агрегации полагаются на это поле как на единственный источник связи (`domains/storage/canvas_session/repository.py:299-320,655-665` — `live_tobe_updated` по derived_from_session_id).

### 1.4. Вердикт по задаче 1

- Связь AS IS→TO BE **сохраняется после save TO BE на уровне сессии**: физически `sessions.derived_from_session_id` (TEXT), устойчиво к правкам в моделлере и повторным save.
- **Per-element provenance после save отсутствует и не восстанавливается** — теряется при закрытии вкладки; overlay/traceMap перестраиваются только в рамках живой сессии трансформации. XML-плоскость (bpmn_xml/bpmn_meta_json/interview_json) по коду и по данным provenance не содержит. Для «provenance-first» стратегии это главный архитектурный разрыв: нужна запись derived_from/trace_map при save (в XML extensionElement или notes_by_element_json/bpmn_meta_json).

## 2. Выживаемость zeebe:properties при round-trip через моделлер

### 2.1. Код-аудит (a)

Собственный парсер/сериализатор extensionElements во фронте **есть и зарегистрирован в моделлере**:

- `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js:92,329-331` — в bpmn-js Modeler подключены moddle-дескрипторы `zeebeModdleDescriptor` и `pmModdleDescriptor` → bpmn-js корректно парсит и сериализует `zeebe:extensionElements`/`pm:RobotMeta` без потерь.
- `frontend/src/features/process/camunda/zeebeModdleDescriptor.js`, `camunda/camundaExtensions.js` (DOM-чтение/запись extensionElements, `pm:showOnTask`), `bpmn/stage/template/templateSemanticPayload.js:274-352,490-520,663-664` (restore/sanitize zeebe:properties payload через moddle, `setBpmnProperty(bo, "extensionElements", ...)`), `stage/search/extractCamundaZeebePropertyEntries.js` (индексация), `robotmeta/robotMeta.js` (pm:RobotMeta round-trip).
- Бэкенд XML не переписывает: save-хранилище verbatim (§1.2). Отдельная обрезка extensionElements на путях import не обнаружена (`process_template/bpmn_import.py` читает facts; не мутирует XML при сохранении).
- Предыдущий контур `fix/bpmn-properties-parser-audit-v1` (REVIEW_PASS 2026-05-27, Obsidian AgentReports) уже фиксировал backend-парсер `_extract_xml_property_rows()` для всех типов property-источников (`process_properties_registry.py`) — реестр свойств читает XML из БД напрямую.

### 2.2. Данные (b)

Популяция: 890 живых сессий с непустым XML → **163 (18.3%) содержат `zeebe:properties`**, 191 (21.5%) — любые extensionElements, 7 — pm:RobotMeta.

Глубокий разбор 8 сессий с zeebe:properties (все редактировались после создания, updated_at > created_at, version=2):

| session | title | элементов | контейнеров zeebe:properties | статус после правок |
|---|---|---|---|---|
| 53006f5546 | 123 | 166 | 57 (keys: ee_time 37, ee_operation 36, ingredient 18, container_tara 15, tara 14, equipment 11…) | ✓ целы |
| 6a31dbe457 | prop-speed | 144 | 52 | ✓ целы |
| ca36d5cb15 | вывыв | 103 | 52 | ✓ целы |
| f5e1a2725d | Промыть | 17 | 11 | ✓ целы |
| 162adb73f8 | overlay-desync-fixture | 5 | 1 (ee_operation, ee_time, equipment) | ✓ целы |
| 0291eceea0 | Source Session | 14 | 1 (container_condition) | ✓ целы |
| 707564e262 | Target Session | 15 | 1 (container_condition) | ✓ целы |
| f3948ed8dd | E2E save session | 267 | 1 на уровне collaboration (priority=high) | ✓ целы |

Косвенное доказательство round-trip: все выборочные сессии прошли через edit-save (bpmn_xml_version=2, updated_at позднее created_at) и сохранили 100% контейнеров properties с доменными ключами — значит фронтовый моделлер (зарегистрированные zeebe/pm moddle-дескрипторы) и verbatim-сохранение бэкенда не обрезают extensionElements.

**EVIDENCE GAP:** прямой UI round-trip (stage: import → edit → export → diff XML) не выполнялся — запись в БД запрещена readonly-режимом, stage не трогали. Доказательство косвенное (код + сохранённые данные), не экспериментальное.

## 3. KEY_COVERAGE_MATRIX

Детально в `KEY_COVERAGE_MATRIX.md` (60 схем, 54 проекта, 6 org). Ключевые цифры:

- Покрытие properties: 15/60 схем (25%) имеют zeebe:properties; среднее покрытие 33.3% элементов у них (max 45.1%), по всей выборке — 8.3%.
- Словарь ключей — полностью доменный: ingredient (616), container_tara (607), equipment (441), ingredient_value (301), tara (207), ee_time (136)… Системных ключей (operation_code/robot_id/params) в живых данных нет.
- Имена: task 96.1% / gateway 96.1% / event 70.8% именованы.
- ID: 72% сгенерированные (Activity_/Event_/Flow_) — по ID сопоставлять нельзя.
- 42/60 схем редактировались после создания — в этой подвыборке properties сохраняются (§2.2).

## 4. Реальные пары AS IS↔TO BE и классы диффа

- Пары через `derived_from_session_id`: ровно 2 (§1.1). Обе to_be с пустым bpmn_xml → элементный дифф невозможен; классификация по реальным парам даёт N/A. Пары по title/project: 0.
- Прокси-пары (один project) для методической проверки классификатора: «Source→Target Session» (7→8 эл.): A=0, **B=7**, C=0, D=1; «Добавить ингредиент»×2 (5→5 эл.): A=0, **B=3**, C=2, D=0. Доминирует класс B (name-match, 77% элементов).
- Спецификация классов: `DIFF_CLASSES_SPEC.md` **v2** (исходная v1 недоступна — EVIDENCE GAP). Итог: A недостижим без persistence-фикса provenance; B — рабочий якорь (96% имён у task), но требует one-to-one жадного потребления из-за неуникальности имён; C — только для безымянных событий с генерированными ID.

## 5. Итоги и риски

1. **Provenance после save TO BE сохраняется только на уровне сессии** (`sessions.derived_from_session_id`), per-element — теряется. Для provenance-first нужен bounded фикс записи trace_map/derived_from при save.
2. **zeebe:properties выживают** при edit-save round-trip: код (зарегистрированные moddle-дескрипторы, verbatim save) и данные (163 сессий, 0 потерь в выборке). Прямой UI-эксперимент — EVIDENCE GAP.
3. **Покрытие properties в данных — 25% схем / 33% элементов у покрытых**; словарь чисто доменный.
4. **Доминирующий класс диффа в парах — B (name-match)**; класс A пуст из-за разрыва persistence, не из-за невозможности.
5. Ограничения: замеры на снимке 2026-09-15 (не prod-live); to_be=2 — статистика по реальным парам вырождена; fixtures v1 недоступны.
