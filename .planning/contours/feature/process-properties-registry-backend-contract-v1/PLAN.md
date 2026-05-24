# PLAN

Контур: `feature/process-properties-registry-backend-contract-v1`
Run ID: `20260520T203825Z-44497`
Роль: Agent 1 / Planner
Статус: `READY_FOR_EXECUTION`

## 1. Source/runtime truth before plan

```text
pwd: /opt/processmap-test
remote: origin -> github.com/xiaomibelov/processmap_v1.git
git fetch origin: PASS
branch: feature/process-properties-registry-backend-source-truth-v1
HEAD: 75c53c5808339ab8ff1c1134b6d0139d5b8045b6
origin/main: d805e1c64c1107b9e3fe6854e031694bf741b187
status: clean (ahead 1 commit)
diff --stat: 7 files changed, 1683 insertions(+)
```

Вывод: `process-properties-registry-backend-source-truth-v1` реализован и прошёл review, но ещё не влит в `main`. Новый контур должен базироваться на этом коммите (через новую ветку от `origin/main` + cherry-pick либо напрямую от source-truth ветки). Executor обязан задокументировать выбранный base.

## 2. Цель

Устранить gap в backend API contract `Реестра свойств`: поля `element_type` и `element_title` сейчас пустые, а фильтр `element_types` отсутствует. Это блокирует исправление `CHANGES_REQUESTED` у контура `feature/process-properties-registry-foundation-v1` (фильтр `Тип объекта` показывал element id вместо BPMN type).

## 3. Scope

### In scope

1. **Backend XML parsing**: в `_extract_camunda_rows` парсить `bpmn_xml` сессии через `xml.etree.ElementTree`, строить `element_id -> {type, title}` lookup, заполнять `element_type` (local-name тега) и `element_title` (атрибут `name`).
2. **Backend filter contract**:
   - Добавить `element_types: List[str]` в `ProcessPropertiesRegistryFilters`.
   - Добавить `"element_types": "element_type"` в `_FILTER_MAP`.
   - Добавить `"element_types": set()` в `_filter_options` с сбором уникальных непустых значений.
   - Обновить `_matches_filters` для фильтрации по `element_types`.
3. **Backend storage**: добавить `bpmn_xml` в SELECT `list_process_properties_registry_sources` (только для сессий с `camunda_extensions_by_element_id`; парсить XML лениво).
4. **Backend tests**: обновить `test_process_properties_registry_api.py`:
   - Проверить, что `element_type` и `element_title` заполняются из XML.
   - Проверить фильтрацию по `element_types`.
   - Проверить `filter_options.element_types`.
5. **Frontend filter wiring**: в `ProcessPropertiesRegistryPage.jsx`:
   - Добавить `elementType` в `normalizeBackendRow` (маппинг из `r.element_type`).
   - Добавить фильтр `Тип объекта` с опциями из `options.elementTypes`.
   - Убедиться, что `Тип объекта` не показывает `element_id`.

### Out of scope

- Новые durable таблицы.
- Мутации BPMN XML, `bpmn_meta`, Product Actions.
- Глобальный редизайн shell/header/sidebar.
- Dashboards.
- Merge / PR / deploy.
- Новые endpoints (меняется только payload shape и фильтры существующих).

## 4. API contract delta

### Request input

```json
{
  "filters": {
    "property_types": [],
    "groups": [],
    "sources": [],
    "processes": [],
    "element_types": [],
    "completeness": "all"
  }
}
```

### Response envelope delta

`filter_options` теперь содержит:
```json
{
  "property_types": [],
  "groups": [],
  "sources": [],
  "processes": [],
  "element_types": [],
  "completeness": ["all", "complete", "incomplete"]
}
```

Row fields `element_type` и `element_title` заполняются из BPMN XML вместо `""`.

## 5. Execution split

**SINGLE_EXECUTOR_MODE** — backend contract hardening + минимальный frontend wiring. Параллельный split не требуется.

- **Agent 2 / Executor Part 1**: вся backend реализация (XML parsing, filter contract, tests) + frontend filter wiring.
- **Agent 3 / Executor Part 2**: shell-only merge / no-LLM handoff.

## 6. Branch hygiene

Executor должен либо:
1. `git checkout -b feature/process-properties-registry-backend-contract-v1 feature/process-properties-registry-backend-source-truth-v1`, или
2. `git checkout -b feature/process-properties-registry-backend-contract-v1 origin/main` + cherry-pick `75c53c5`.

Не смешивать с другими контурами. Если в worktree есть unrelated изменения — `BLOCKED` до изоляции.

## 7. Strict non-goals

- No backend schema migration.
- No new durable truth tables.
- No BPMN XML writes.
- No Product Actions mutation.
- No RAG runtime implementation.
- No AI auto-write.
- No full dashboards.
- No global shell/header/sidebar redesign.
- No fake data.
- No broad refactor.
- No merge/PR/deploy.

## 8. Agent 4 gates

`REVIEW_PASS` только если:

- Backend `element_type` и `element_title` заполняются из `bpmn_xml`, а не остаются `""`.
- `filter_options` содержит `element_types` с уникальными отсортированными значениями.
- Фильтрация по `element_types` работает (тест + ручная проверка).
- Frontend фильтр `Тип объекта` показывает BPMN types, а не element ids.
- No mutation: `PUT/PATCH/DELETE` отсутствуют.
- Tests проходят (`test_process_properties_registry_api` — OK).
- Source/runtime truth зафиксирован.

No `REVIEW_PASS` если:
- `element_type` остаётся пустым.
- `element_types` отсутствует в фильтрах или filter_options.
- Frontend `Тип объекта` по-прежнему показывает element ids.
- Only source/tests checked without curl/API proof.

## 9. Required artifacts

- `EXECUTOR_PART_1_PROMPT.md`
- `EXECUTOR_PART_2_PROMPT.md`
- `REVIEWER_PROMPT.md`
- `RAG_PREFLIGHT_PLANNER.md`
- `OBSIDIAN_CONTEXT_USED.md`
- `GSD_CONTEXT_USED.md`
- `STATE.json`
- `AGENT_RUN_ID`
- `READY_FOR_EXECUTION`
