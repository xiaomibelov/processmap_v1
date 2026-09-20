# PR — S5: property panel → element.updateProperties ops (documentation hole закрыт)

> Контур: `feature/mutation-gateway-c3`, срез S5 (PLAN.md §7/§8). Base: S4 (`2f762849`, VERIFIED).
> Merge/PR — только по explicit approve владельца.

## Инвентаризация писателей (первый шаг, полная — с file:line)

- **Класс A (name)**: canvas direct-editing; context-menu `executeBpmnContextMenuAction.js:206-223` → modeling.updateLabel/updateProperties → **ops уже** (whitelist).
- **Класс B (documentation)**: `executeBpmnContextMenuAction.js:229-250` → modeling.updateProperties({documentation: [moddle rows]}) → sanitizeValue **молча терял rows** → фантомный no-op op (**дыра**: правка не перзистилась ops-каналом). → **исправлено в ops** (S5).
- **Класс B2 (camunda-атрибуты — исполнители/дедлайны)**: modeling.updateProperties строковыми значениями → ops; backend verbatim — но **unbound prefix** крашил re-parse при отсутствии xmlns → **исправлено** (applier добавляет объявление).
- **Класс C (camunda custom properties key-value + listeners)**: NotesPanel `NotesPanel.jsx:2712/2814` → `App.jsx:2914` setElementCamundaExtensions → `save/propertySaveBoundary.js:14` → saveBpmnState(property_update); context-menu `executeBpmnContextMenuAction.js:272-273` → `propertyCrudBoundary.js:120-182/344-377` → saveBpmnState(session_save, apiPutBpmnXml) — **full-XML PUT**. Modeler-apply `camundaExtensions.js:1338-1392` давал фантомный op.
- Системный save_all (`App.jsx:1103`) — cold §9, вне панели.

## Классы: ops либо явный needsFullSave

- **A/B/B2 → ops** (`element.updateProperties` + updateLabel, спец-оп-коды не плодились). Golden-parity: серверный XML после ops === после full-PUT для name/documentation/camunda:* (pytest: documentation rows replace-children + textFormat; camunda attrs verbatim + xmlns-declaration; повторная правка заменяет блок).
- **C → needsFullSave (cold) с причиней**: extensionElements — структурный payload; round-trip сериализации moddle в sync-маппере — риск #995; полный путь boundary — корректный fail-closed. Молчаливой потери нет: `sanitizeUpdateProperties` отвергает moddle/немаппимое → needsFullSave; boundary-apply подавлен (suppressCommandStackRef) — фантомный op и двойной PUT устранены.
- **sanitizeValue-контракт усилен**: скаляры/вложенные plain-объекты — как раньше; ссылочные типы (moddle и пр.) → needsFullSave.

## e2e-гейты по классам (локальный стек ветки, контейнерный финал)

| Класс | PUT /bpmn | POST /operations | reload |
|---|---|---|---|
| A rename | 0 | 1 | ✓ |
| B documentation | 0 | 1 | ✓ |
| B2 camunda:assignee | 0 | 1 | ✓ |

`evidence/s5/logs/s5-e2e.jsonl`.

## Hang-тест (pre-existing, не чинился)

`saveBpmnState.property-pipeline :: transport hangs` — статика: xmlPipeline.transportTimeoutMs=60_000 (намеренно, комментарий autosaveConfig.js:19-24); hang теста 12с < 60с → ok:true → assert падает. **Не дыра S5**: property-пути перзистят (e2e 0-PUT / boundary full-PUT), реальный hang bounded 60с abort+reconcile. Tech-debt мини-фикс теста — вне скоупа, эскалация.

## Метрика путей: 14 → **13** (честно)

documentation ушёл из full-путей в детерминированный ops (ранее фактически не перзистился / полагался на смежные сохранения). Остаются cold с причинами: C (camunda custom properties, #995 — кандидат на S7+ после snapshot oldBounds/undo работ), participant (навсегда), data-ассоциации, degrade (S6), undo-of-delete (S7), системные cold-действия §9.

## Дата смерти

**`fpc_gateway_cold_fallback` = 2026-10-03** (последний день; после даты флаг и fallback-ветки удаляются либо эскалация владельцу). Kill-switch `fpc_gateway_lane` (S1) без изменений.

## Тест-матрица

| Слой | Результат |
|---|---|
| backend ops/parity/committed/conflict | 58 passed + 3 subtests (golden documentation rows, camunda verbatim, invalid_documentation typed 422) |
| frontend save-зоны | 553/554 (1 pre-existing hang) |
| полный frontend-сьют | 4002 теста, 0 новых падений vs S4-baseline |

## Rollback

1. Revert `90fcb467` — классы B/B2 возвращаются в пред-S5 состояние (documentation-dыра восстановится — откат целенаправленный).
2. Оперативно: `localStorage.fpc_gateway_lane="0"`.

## Риски

- C-class full-PUT остаётся основным путем панели (by design до S7+).
- `_ensure_attribute_prefixes_declared` — объявления добавляются только для KNOWN_NAMESPACES-префиксов; неизвестный префикс в op → unbound prefix как раньше (фронт не шлёт таких).
