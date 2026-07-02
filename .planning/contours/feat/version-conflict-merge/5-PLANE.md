# 5-plane proof — `feat/version-conflict-merge`

## 1. Code

- **Repo:** `/opt/processmap-test/.worktrees/feat-version-conflict-merge`
- **Remote:** `https://github.com/xiaomibelov/processmap_v1.git`
- **Baseline:** `origin/main @ bb4f9388bc976cf3db9dffaa43fddd8f16d13ae1`
- **Контур:** `.planning/contours/feat/version-conflict-merge/`
- **Затрагиваемые backend-файлы:**
  - `backend/app/_legacy_main.py` — `touch_session_presence_api` (добавить `diagram_state_version` в ответ).
  - `backend/app/services/session_service.py` — `get_session_meta` (top-level `last_modified_by/at`).
  - `backend/app/utils/session_helpers.py` — `_build_server_last_write_payload` (уже готово, возможно расширить для meta).
- **Затрагиваемые frontend-файлы:**
  - `frontend/src/components/ProcessStage.jsx` — интеграция merge-панели, расширение conflict modal, badge state.
  - `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx` — бейдж `diagram_state_version` + conflict tone.
  - `frontend/src/features/process/stage/ui/ProcessStageSaveConflictModal.jsx` — кнопка «Сравнить и выбрать».
  - `frontend/src/features/process/stage/ui/saveConflictModalModel.js` — view-model для новой кнопки.
  - `frontend/src/features/process/stage/ui/BpmnVersionList.jsx` — кнопки «Сравнить / Восстановить».
  - `frontend/src/features/process/stage/ui/BpmnVersionDiffOverlay.jsx` — поддержка left/right labels, опционно двухпанельный режим.
  - `frontend/src/features/process/stage/ui/BpmnMergePanel.jsx` — **новый** side-by-side merge компонент.
  - `frontend/src/features/process/stage/ui/BpmnMergePanel.model.js` — view-model для merge-панели.
  - `frontend/src/features/process/stage/remoteSessionUpdateToast.js` — уже готово, возможно добавить action hint.
  - `frontend/src/features/process/navigation/saveUploadStatus.js` — уже нормализует conflict, добавить `canForceSave` флаг.

## 2. Workspace

- Рабочая директория: `/opt/processmap-test/.worktrees/feat-version-conflict-merge`.
- `git status` clean; контур изолирован в `.planning/contours/feat/version-conflict-merge/`.
- Новая ветка от `origin/main`, независимая от `uiux/bpmn-diagram-search-v1`.

## 3. DB

- **Engine:** SQLite (`backend/app/storage.py`).
- **Путь:** `<base_dir>/processmap.sqlite3`.
- **Существующие relevant таблицы:**
  - `sessions` — `diagram_state_version`, `diagram_last_write_actor_user_id/label/at`, `diagram_last_write_changed_keys_json`.
  - `bpmn_versions` — `id`, `session_id`, `version_number`, `diagram_state_version`, `bpmn_xml`, `created_by`, `created_at`, `source_action`, `session_payload_hash`.
  - `session_state_versions` — history of state snapshots.
- **Необходимые additions:** нет схематических изменений; только расширение ответов API.

## 4. Env / compose

- **Stage compose:** `docker-compose.stage.yml`.
- **Stage host:** `clearvestnic.ru:5177`.
- **Локальная разработка:** `npm run dev` + `docker compose up`.
- **E2E:** Playwright только против `clearvestnic.ru:5177`.
- Важно: убедиться, что `FPC_E2E_CAS_BYPASS` не включён на stage, иначе 409 не воспроизвести.

## 5. Serving mode

- **Stage target:** `clearvestnic.ru:5177`.
- **No deploy without user approve**.
- **Flow:** branch → push → PR → user approval → merge → auto-deploy stage → manual verify.
- Чекпоинты:
  1. Detection — toast + badge.
  2. Merge — `BpmnMergePanel` + actions.
  3. Diff + History — semantic diff highlighting + history actions.
