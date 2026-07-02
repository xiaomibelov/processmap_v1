# Solution — Version Conflict Detection + Merge

**Contour:** `feat/version-conflict-merge`  
**Target:** `origin/main` → stage (`clearvestnic.ru:5177`)  
**Approach:** 3 checkpoints, reuse existing CAS/version/diff infrastructure.

## Общие принципы

1. **Reuse first.** Backend already has `diagram_state_version`, 409 conflict, `bpmn_versions`, restore. Frontend already has remote-update toast, save conflict modal, `BpmnVersionList`, `BpmnVersionDiffOverlay`.
2. **Minimal backend changes.** Только добавить `diagram_state_version` в presence и `last_modified_by/at` top-level в meta.
3. **Side-by-side merge panel.** Новый компонент `BpmnMergePanel` с двумя readonly `NavigatedViewer` и action bar.
4. **No deploy без approve.** После каждого checkpoint — отчёт и approve перед следующим.

## Checkpoint 1 — Detection (toast + badge)

### Backend

- `touch_session_presence_api` (`backend/app/_legacy_main.py:3964`):
  - В ответ добавить `diagram_state_version: int(getattr(sess, "diagram_state_version", 0) or 0)`.
- `get_session_meta` (`backend/app/services/session_service.py:344`):
  - В top-level `meta` добавить:
    - `last_modified_by` = `latest_version.created_by` или `diagram_last_write_actor_user_id` из `sessions` projection.
    - `last_modified_at` = `latest_version.created_at` или `diagram_last_write_at`.
  - Сохранить backward-compatible: все старые поля остаются.

### Frontend

- `ProcessStageHeader.jsx`:
  - Добавить рядом с `diagram-toolbar-version-chip` новый бейдж `diagram_state_version` (`data-testid="diagram-toolbar-diagram-state-version-chip"`).
  - При `saveUploadStatus?.state === "conflict"` или `remoteSaveHighlightBadge?.serverVersion > localVersion` красить бейдж в `danger` и добавлять пульсирующий индикатор.
  - Tooltip: `Текущая версия диаграммы: N. Есть более новая версия M от X.`
- `remoteSessionUpdateToast.js` / `ProcessStage.jsx`:
  - Убедиться, что persistent toast при remote update имеет action label «Посмотреть изменения» → открывает `BpmnMergePanel`.
  - Сохранить «Обновить сессию» как fallback.

### Тесты

- Backend unit: presence response содержит `diagram_state_version`.
- Frontend unit: `ProcessStageHeader` бейдж показывает версию и conflict tone.
- Playwright (clearvestnic): два браузера, один сохраняет, другой видит toast.

---

## Checkpoint 2 — Merge panel + actions

### Новые файлы

- `frontend/src/features/process/stage/ui/BpmnMergePanel.jsx`
  - Props: `open`, `localXml`, `serverXml`, `localVersion`, `serverVersion`, `serverActorLabel`, `onAcceptLatest`, `onKeepMine`, `onCompare`, `onCancel`, `busy`.
  - Layout: 50/50 grid, левая панель «Ваша версия (vN)» жёлтая рамка, правая «Последняя версия (vM) от X» зелёная рамка.
  - Каждая панель — `NavigatedViewer` с lazy import.
  - Action bar снизу: `[Принять последнюю версию] [Оставить мою версию] [Сравнить детально] [Отмена]`.
  - `data-testid`: `bpmn-merge-panel`, `bpmn-merge-panel-local`, `bpmn-merge-panel-server`, `bpmn-merge-accept-latest`, `bpmn-merge-keep-mine`, `bpmn-merge-compare`, `bpmn-merge-cancel`.
- `frontend/src/features/process/stage/ui/BpmnMergePanel.model.js`
  - `buildMergePanelView({ conflict, localXml, serverXml, currentUserId, latestBpmnVersionHead, versionsList })`.
  - Резолвит `localVersion`, `serverVersion`, `serverActorLabel`, `canKeepMine` (есть ли локальные изменения / права на edit).

### Интеграция

- `ProcessStage.jsx`:
  - Новое состояние: `mergePanelOpen`, `mergePanelTargetXml`, `mergePanelTargetHead`.
  - Функция `openMergePanel({ source: "remote_toast" | "save_conflict_modal" | "version_history" })`.
  - `handleMergeAcceptLatest`:
    1. Закрыть панель.
    2. `apiGetSession(sid)` + `onSessionSyncWithVersion`.
    3. `bpmnSync.resetBackend()`.
    4. `setSaveUploadLifecycleEvent(IDLE_SAVE_UPLOAD_EVENT)`.
    5. `setInfoMsg(...)`.
  - `handleMergeKeepMine`:
    1. Взять текущий XML из `bpmnRef.current?.getXmlDraft?.()` или `draftRef.current?.bpmn_xml`.
    2. Вызвать `apiPutBpmnXml(sid, xml, { baseDiagramStateVersion: conflict.serverCurrentVersion, sourceAction: "merge_keep_mine" })`.
    3. При 409 — оставить модал/панель открытой и обновить conflict payload.
    4. При 200 — `bpmnSync.resetBackend()`, закрыть панель, показать info toast.
  - `handleMergeCompare`: открыть `BpmnVersionDiffOverlay` (left = local, right = server).
- `ProcessStageSaveConflictModal.jsx` + `saveConflictModalModel.js`:
  - Добавить кнопку «Сравнить и выбрать» рядом с «Обновить сессию».
  - `onCompare` открывает `BpmnMergePanel`.

### Тесты

- Unit: `BpmnMergePanel.model.js` корректно резолвит view.
- Unit: `ProcessStageSaveConflictModal` рендерит кнопку compare.
- Playwright: browser Б открывает merge-панель, принимает последнюю версию; browser А делает ещё одно изменение; browser Б видит новый toast.

---

## Checkpoint 3 — Diff highlighting + history panel

### Diff overlay

- `BpmnVersionDiffOverlay.jsx`:
  - Добавить props `previousLabel`, `nextLabel` (уже есть) и `mode: "single" | "split"`.
  - В split-режиме показывать две панели: слева previous, справа next (reuse `BpmnVersionPreview` для второй панели).
  - Улучшить highlighting: для removed элементов рисовать бейдж на предыдущей диаграмме (сейчас removed не отображается на целевой).
- `buildSemanticBpmnDiff` (`frontend/src/features/process/bpmn/diff/semanticDiff.js`):
  - Убедиться, что возвращает `added`, `removed`, `changed` с `name`, `type`, `id`.
  - Добавить `properties` в changed (если ещё нет).

### History panel

- `BpmnVersionList.jsx`:
  - Добавить в каждый item кнопки:
    - «Сравнить с текущей» → `onCompareWithCurrent(item)`.
    - «Восстановить» → `onRestore(item)` (только для editor/owner/admin).
  - Скрывать «Восстановить» для readonly сессии.
- `ProcessStage.jsx`:
  - Обработчики `handleCompareVersionWithCurrent` и `handleRestoreVersion`.
  - `handleRestoreVersion` вызывает `apiPostBpmnRestore(sid, versionId)` → `bpmnSync.resetBackend()`.

### Тесты

- Unit: `BpmnVersionDiffOverlay` корректно отображает added/changed badges.
- Unit: `BpmnVersionList` рендерит кнопки compare/restore.
- Playwright: added (зелёный), removed (красный), modified (жёлтый) элементы подсвечены корректно.

---

## Edge cases

- **Readonly сессия:** `canKeepMine` = false, скрыть «Оставить мою версию» и «Восстановить».
- **Offline:** если `meta` или `presence` падает с сетевой ошибкой — не показывать конфликт, fallback к текущему поведению.
- **Быстрое переключение сессий:** `useEffect` в `ProcessStage` уже сбрасывает `remoteSessionPollSeenDiagramStateVersionRef`.
- **Undo/redo:** принятие последней версии через `resetBackend()` сбрасывает undo stack.
- **Auto-save:** при конфликте `saveUploadStatus.state === "conflict"` отменяем queued autosave (`cancelPendingDiagramAutosave`) до закрытия merge-панели/conflict-modal.

---

## Верификация

- `npm run build` (frontend).
- Backend smoke: `python -m pytest backend/tests` (или аналогичная команда проекта).
- `node --test` для новых/изменённых `.test.mjs`.
- Playwright на `clearvestnic.ru:5177`:
  1. Browser A: открыть сессию, изменить, сохранить (v1 → v2).
  2. Browser B: открыть ту же сессию → toast «Сессию обновил ...».
  3. Browser B: «Посмотреть изменения» → `BpmnMergePanel` с двумя панелями.
  4. Browser B: «Принять последнюю» → версия v2 загружена.
  5. Browser A: изменить и сохранить (v2 → v3/v4).
  6. Browser B: видит новый toast.
