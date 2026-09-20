# EXEC_REPORT — S5 (property panel → element.updateProperties ops) контура feature/mutation-gateway-c3

Дата: 2026-09-20. Роль: Agent 2 (Executor). Срез: S5 по PLAN.md §7/§8.
Статус: **DONE** (push после среза; PR не создавался).

## Инвентаризация писателей панели свойств (первый шаг, до правок)

| Класс | Контролы / точки | Путь записи (file:line, состояние ДО S5) |
|---|---|---|
| **A. name** (rename) | canvas direct-editing; context-menu rename | `executeBpmnContextMenuAction.js:206-223` (modeling.updateLabel/updateProperties {name}) → commandStack → **ops уже** (`element.updateProperties`/`element.updateLabel` whitelist) |
| **B. documentation** | context-menu / панель (documentation rows) | `executeBpmnContextMenuAction.js:229-250` — modeling.updateProperties(el, {documentation: **[moddle rows]**}) → commandStack → маппер → sanitizeValue **терял rows молча → фантомный no-op op (ДЫРА: изменение не перзистилось ops-каналом)** |
| **B2. camunda-атрибуты** (исполнители/дедлайны: `camunda:assignee/dueDate/candidateGroups`, zeebe) | attribute-контролы | modeling.updateProperties со строковыми значениями → ops; backend verbatim attrs — **unbound prefix** при отсутствии xmlns в документе (краш re-parse) |
| **C. camunda custom properties** (key-value extensionProperties/listeners) | NotesPanel `NotesPanel.jsx:2712/2814` → App.jsx:2914 `setElementCamundaExtensions` → `buildPropertySaveOptions` (`save/propertySaveBoundary.js:14`) → saveBpmnState(property_update) → xml pipeline; context-menu: `executeBpmnContextMenuAction.js:272-273` → `propertyCrudBoundary.setProperty` (`propertyCrudBoundary.js:120-182`) → `_flushSave` (`:344-377`) → saveBpmnState(session_save) с `apiPutBpmnXml` | **full-XML PUT**; modeler-apply `camundaExtensions.js:1338-1392` (modeling.updateProperties extensionElements moddle) давал фантомный no-op op в outbox |
| D. system batch | Ctrl+S / save_all (`App.jsx:1103`) | системное cold-действие §9 — вне панели, не тронуто |

Исполнители/статусы как отдельный класс: не выявлено писателей в diagram-truth вне классов B2/C (атрибутивные записи — B2; key-value — C). Meta-пути (bpmn_meta) — не diagram-truth, вне скоупа.

## Что сделано (RED→GREEN)

### Класс B (documentation) → ops — ДЫРА закрыта
- RED: `updateProperties documentation (moddle rows) → op payload rows` падал (sanitize терял).
- GREEN: `serializeDocumentationRows` (commandToOps.js) — rows {text, textFormat} → op-payload; backend `_set_documentation_rows` — replace-children (повторная правка заменяет блок, textFormat attr, documentation первый child — golden full-PUT parity); битый row → typed 422 `invalid_documentation` (fail-closed). Undo parity через oldProperties rows.
### Класс B2 → ops с golden parity
- Backend `_ensure_attribute_prefixes_declared`: verbatim-атрибуты camunda:/zeebe: — applier добавляет xmlns при отсутствии (unbound prefix ронял re-parse; KNOWN_NAMESPACES расширен). Golden parity name/documentation/camunda-атрибуты === full-PUT (pytest).
### Класс C — явный cold с причиней (fail-closed)
- `sanitizeUpdateProperties`: `extensionElements` (moddle, структурный payload) → **needsFullSave**; любое немаппимое значение → needsFullSave (урок E3: молчаливой потери нет). Причина cold: round-trip сериализации extensionElements в sync-маппере — риск #995; boundary full-PUT — корректный fail-closed путь.
- Suppression: `applyElementCamundaExtensionsToModeler` (imperative api) обёрнут в `suppressCommandStackRef` (BpmnStage ctx) — убран фантомный no-op op и риск двойного PUT (boundary сам перзистит).
- `sanitizeProperties` (старый) удалён — вытеснен sanitizeUpdateProperties.

## Diffstat (коммит `90fcb467`)

| Файл | Δ |
|---|---|
| `commandToOps.js` | +50/−8 (serializeDocumentationRows, sanitizeUpdateProperties, fail-closed; −sanitizeProperties) |
| `ops_applier.py` | +50 (documentation rows, prefix-declaration, KNOWN_NAMESPACES camunda/zeebe) |
| `BpmnStage.jsx` / `bpmnStageImperativeApi.js` | +17 (suppression boundary-apply) |
| тесты | frontend +5 блоков (60/60), backend +2 golden (58 passed + 3 subtests с учётом зон) |

## e2e-гейты по классам (локальный стек ветки; финал на контейнере 15177)

| Класс | Сценарий | PUT /bpmn | POST /operations | reload server truth |
|---|---|---|---|---|
| A rename | updateLabel «Задача S5 A» | **0** | 1 | name ✓ |
| B documentation | modeling documentation moddle rows «Документация S5» | **0** | 1 | `<bpmn:documentation>` ✓ |
| B2 исполнитель | `camunda:assignee=demo.s5` verbatim | **0** | 1 | attr + xmlns ✓ |

PASS (dev-итерация с фиксацией read-counters-before-reload + контейнерный финал). Класс C: cold-дюрабельность покрыта существующими property-pipeline-спеками + fail-closed юнитами (синтетический boundary-wire через page.evaluate не воспроизводит production-замыкания — не имитировал, зафиксировано).

## Вердикт по pre-existing hang-тесту (без починки, по условию)

`saveBpmnState.property-pipeline :: property save returns error when coordinator transport hangs`: статическая причина — тест ждёт timeout <15с при hang 12с, но `autosaveConfig.js` (xmlPipeline.transportTimeoutMs) = **60_000** — намеренно поднято с 10_000 в прошлом контуре (комментарий :19-24: abort — last-resort при просадке среды; сервер сам обрабатывает PUT ~0.3с). Hang 12с < 60с → transport возвращает ok → assert падает. **Это НЕ дыра S5**: (а) property-пути перзистят через ops (e2e 0-PUT) или boundary full-PUT; (б) реальный hang bounded 60с abort + reconcileTimeout; (в) дюрабельность классов доказана reload-равенством. Тест устарел относительно намеренного 60с-окна → tech-debt мини-фикс теста вне bounded-скоупа (эскалация владельцу, не маскировка).

## Прогоны

| Слой | Результат |
|---|---|
| backend ops/parity/committed/conflict | 58 passed + 3 subtests |
| frontend save-зоны | 553/554 (1 = pre-existing hang) |
| полный frontend-сьют | 4002 теста, **0 новых падений** vs S4-baseline (76 fail / 73 unique идентичны) |

## Метрика путей: 14 → **13**

Из full-путей вышел **documentation** (класс B: ранее — потеря/неопределённость, фактически полагался на смежные full-сохранения; теперь детерминированный ops). name/camunda-атрибуты подтверждены ops (были формально). Остаются cold с причинами: C (camunda custom properties, #995), participant (навсегда), dataInput/OutputAssociation, degrade (S6), undo-of-delete (S7), системные cold-действия §9.

## Handoff / переносы на S6+

- S6: degrade-замена (C-класс full-PUT станет регистрируемым cold-действием; ops-degrade → conflict gate), аудит прямых PUT, `fpc_gateway_cold_fallback`-ветки.
- S7: undo-of-delete compensating create-op; snapshot oldBounds (снимет needsFullSave undo text-edit аннотации и даст путь к C-классу ops позже).
- Тech-debt: мини-фикс hang-теста (hang >60с или ожидание abort-сигнала).
