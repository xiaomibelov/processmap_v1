# REVIEW_REPORT — fix/canvas-align-v2

Дата: 2026-09-24. Reviewer: parent agent (ручной diff-review + baseline-прогоны).

## Вердикт: APPROVE

## Требование 1 — внутри лайна
- `laneRowAlign.js`: группировка по laneKey, кластеры centerY (порог 40), ряд ≥2
  с каноном и зазором 100, медиана Y — покрыто 11 точными тестами (включая
  кламп в laneBounds и запрет пересадки через независимые группы).
- Caller-маппинг: `readAlignContainerForElement` идёт по `el.parent` и берёт
  lane, иначе participant — пересечения пулов конструктивно исключены клампом
  целевых координат в контейнер. Все ноды вне canon-типов (SubProcess,
  BoundaryEvent) и singleton-ряды — вне плана.

## Требование 2 — стрелки транслируются
- План трансляций чистый; применение сдвигает координаты существующих точек
  (включая `original` и DI-waypoints) — форма секвенса сохраняется побайтово.
- Структурный гейт: в теле `alignDiagramOnInstance` отсутствуют layoutConnection,
  updateWaypoints, moveElements (source-regex на срезе функции).
- Разные дельты концов → дельта источника: детерминированно, зафиксировано.

## Требование 3 — одна операция + страховка
- Одна команда `fpc.alignDiagram` (registerHandler + execute/revert с записью
  старого состояния) → один шаг undo/redo. Dirty-механизм commandStack
  (handler return → _markDirty → elements.changed) подтверждён по diagram-js.
- Снапшот «До выравнивания» — атомарно с full-PUT (source_action "align",
  prev-снапшот планирует сервер). Провал PUT или отсутствие bpmnVersionSnapshot
  → commandStack.undo() → ошибка пользователю. Требование «снапшот не создался
  → align не применяется» выполнено в интерпретации «атомарно с применением,
  при провале — полный откат» (no-op guard делает отдельный pre-PUT снапшот
  невозможным без расширения backend; зафиксировано в PLAN).
- Ограничение: undo после успеха откатывает канвас без персиста — задокументировано.

## Требование 4 — сохранение без 422
- Выбран путь «полный XML одной операцией»: `commandToOps` игнорирует команду
  (ни ops, ни needsFullSave — тест на execute и undo) → ops-applier в принципе
  не задействован → 422 невозможен. Сохранение через существующий rawXml
  pipeline (CAS/retry/409-обработка штатные).
- Backend: только `"align"` в user-facing множестве; OpenAPI-схема не меняется
  (source_action free-form) → регенерация не требуется по §6.1.

## Проверки
- Полный frontend: контур 4253/4172/77; baseline 4246/4164/78 — **0 регрессий**
  (списки уникальных фейлов совпадают; один flaky presence-тест стал зелёным).
- Backend: test_latest_user_facing_bpmn_version 5/5 (align в эталонном множестве).
- Vitest smoke компонентов process: 13/13; tobeOverlayUnderlay 15/15.

## Замечания (не блокеры)
1. Ручная QA на живой много-пульной схеме обязательна (acceptance из постановки):
   align с ветками/петлями, undo, версия «До выравнивания» в истории.
2. Undo после успешного сохранения не персистит откат (см. PLAN) — при желании
   отдельным контуром можно прокидывать full-save и на undo команды align.
3. RAG-инфраструктура workspace по-прежнему degraded (OOM reindex) — вне контура.
