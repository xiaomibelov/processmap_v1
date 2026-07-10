# Исследование системы версий BPMN-сессий ProcessMap

**Дата:** 2026-07-01  
**Контур:** `.planning/contours/audit/bpmn-version-system/`  
**Целевой URL:** `https://stage.processmap.ru/app?project=ab24d58be6&session=f2e75de3b1`  
**Скриншоты:** сняты на `http://clearvestnic.ru:5177` (альтернативный stage, та же кодовая база), потому что для `stage.processmap.ru` не подошли известные тестовые credentials `admin@local` / `admin`.

---

## 1. Backend: таблицы и API

### 1.1 Таблица `sessions`

**Файл:** `backend/app/storage.py:1363–1406`

Ключевые для версий поля:

| Поле | Тип | Назначение |
|------|-----|------------|
| `bpmn_xml` | TEXT | Текущее BPMN-XML сессии |
| `bpmn_xml_version` | INTEGER | Значение `session.version` на момент последней записи BPMN |
| `diagram_state_version` | INTEGER | Монотонный CAS-счётчик каждой записи диаграммы/состояния |
| `diagram_last_write_actor_user_id` | TEXT | ID пользователя, последним изменившего диаграмму |
| `diagram_last_write_actor_label` | TEXT | Читаемое имя автора последнего изменения |
| `diagram_last_write_at` | INTEGER | Timestamp последнего изменения диаграммы |
| `diagram_last_write_changed_keys_json` | TEXT | Какие поля изменились при последней записи |
| `bpmn_graph_fingerprint` | TEXT | Фингерпринт графа |
| `version` | INTEGER | Общий optimistic-lock счётчик сессии |

### 1.2 Таблица `bpmn_versions`

**Файл:** `backend/app/storage.py:1446–1468`

```sql
CREATE TABLE IF NOT EXISTS bpmn_versions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  org_id TEXT NOT NULL DEFAULT 'org_default',
  version_number INTEGER NOT NULL,
  diagram_state_version INTEGER NOT NULL DEFAULT 0,
  bpmn_xml TEXT NOT NULL DEFAULT '',
  session_payload_hash TEXT NOT NULL DEFAULT '',
  session_version INTEGER NOT NULL DEFAULT 0,
  session_updated_at INTEGER NOT NULL DEFAULT 0,
  source_action TEXT NOT NULL DEFAULT '',
  import_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT ''
)
```

Индексы:
- `idx_bpmn_versions_session_version` — UNIQUE `(session_id, org_id, version_number)`
- `idx_bpmn_versions_session_created` — `(session_id, org_id, created_at DESC)`
- `idx_bpmn_versions_session_diagram_state` — UNIQUE `(session_id, org_id, diagram_state_version) WHERE diagram_state_version > 0`

### 1.3 Таблица `session_state_versions`

**Файл:** `backend/app/storage.py:1471–1489`

Хранит **технический трек** каждого accepted-изменения диаграммы, которое увеличивает `diagram_state_version`, но **не** меняет `bpmn_xml` (например, изменения `bpmn_meta`).

### 1.4 API endpoints

Все endpoints версий находятся под `/api/sessions/{session_id}/bpmn/...`:

| Method | Path | Handler |
|--------|------|---------|
| `PUT` | `/api/sessions/{id}/bpmn` | `session_bpmn_save` (`backend/app/routers/sessions.py:208`) |
| `GET` | `/api/sessions/{id}/bpmn/versions` | `session_bpmn_versions_list` (`sessions.py:212`) |
| `GET` | `/api/sessions/{id}/bpmn/versions/{version_id}` | `session_bpmn_version_detail` (`sessions.py:216`) |
| `POST` | `/api/sessions/{id}/bpmn/restore/{version_id}` | `session_bpmn_restore` (`sessions.py:220`) |
| `DELETE` | `/api/sessions/{id}/bpmn` | `session_bpmn_clear` (`sessions.py:224`) |

Frontend route helpers: `frontend/src/lib/apiRoutes.js:156–161`.

---

## 2. Когда создаётся версия

**Ключевая функция:** `_create_bpmn_revision_snapshot_if_needed` — `backend/app/_legacy_main.py:7359–7403`.

### 2.1 Условия создания

- **Каждый PUT `/bpmn`, который изменяет XML**, создаёт версию (`source_action` обычно `manual_save`).
- Для `publish_manual_save` версия создаётся также, если изменился `session_payload_hash` или XML отличается от последней пользовательской версии, даже когда XML-строка не изменилась относительно предыдущего состояния сессии.
- Пустой XML (`next_xml` пустой) не приводит к созданию версии.

### 2.2 Триггеры создания версий

| Триггер | `source_action` | Место в коде |
|---------|-----------------|--------------|
| Общее/ручное сохранение BPMN | `manual_save` или переданный frontend | `backend/app/_legacy_main.py:7542` |
| Явная публикация / создание ревизии | `publish_manual_save` | `backend/app/_legacy_main.py:7542` |
| Импорт BPMN | `import_bpmn` | `backend/app/_legacy_main.py:7542` |
| Экспорт перегенерировал XML из графа | `export_regenerate` | `backend/app/_legacy_main.py:7249` |
| Восстановление версии | `restore_bpmn_version` | `backend/app/_legacy_main.py:7929` |
| Очистка BPMN | `clear_bpmn` | `backend/app/_legacy_main.py:8004` |
| Вставка из буфера (task/subprocess) | `clipboard_paste_task`, `clipboard_paste_subprocess` | `backend/app/clipboard/materializer.py` |

### 2.3 Session payload hash

**Файл:** `backend/app/storage.py:820–845`

SHA-256 от нормализованного JSON-пэйлоада сессии (`title, roles, notes, nodes, edges, questions, bpmn_xml, bpmn_graph_fingerprint, bpmn_meta`). Используется для определения, изменилась ли сессия с момента последней пользовательской версии.

---

## 3. Типы версий

### 3.1 Backend-классификация

**Файл:** `backend/app/_legacy_main.py:7328–7343`

```python
_USER_FACING_BPMN_VERSION_ACTIONS = {
    "publish_manual_save",
    "manual_publish",
    "manual_publish_revision",
    "import_bpmn",
    "restore_bpmn",
    "restore_revision",
    "restore_bpmn_version",
    "session.bpmn_restore",
}
```

Версии с `source_action` из этого множества считаются **пользовательскими** (`user_facing`). Остальные — технические/рантайм (`manual_save`, `autosave`, `export_regenerate`, etc.).

### 3.2 Frontend-классификация

**Файл:** `frontend/src/features/process/stage/ui/revisionEventClassifier.js`

| `source_action` | Класс | Отображаемая сущность |
|-----------------|-------|----------------------|
| `publish_manual_save`, `manual_publish`, `manual_publish_revision` | meaningful | Ручная публикация |
| `import_bpmn` | meaningful | Импорт BPMN |
| `restore_bpmn`, `restore_revision`, `restore_bpmn_version`, `session.bpmn_restore` | meaningful | Восстановление BPMN |
| `manual_save`, `autosave`, `tab_switch`, `pending_replay`, `runtime_change`, `queued`, `lifecycle_flush`, `sync`, `export_regenerate` | technical | Техническое сохранение |

### 3.3 Как отображаются в UI

В `BpmnVersionList` показываются **только meaningful** версии. Технические скрыты из UI истории (но учитываются в счётчиках на бэкенде).

Бейджи статуса в списке:
- **текущая** — версия, чей `session_payload_hash` совпадает с текущей сессией (fallback — последняя meaningful-версия).
- **последняя** — первая в списке meaningful-версий.
- **устаревшая** — всё остальное.

Также отображается номер ревизии (`№N`), дата/время, автор с аватаркой, короткий хэш и размер.

---

## 4. Frontend UI

### 4.1 Компоненты

| Компонент | Файл | Назначение |
|-----------|------|------------|
| `ProcessDialogs` | `frontend/src/features/process/stage/ui/ProcessDialogs.jsx` | Оркестратор модалок |
| `BpmnVersionList` | `frontend/src/features/process/stage/ui/BpmnVersionList.jsx` | Левый список версий |
| `BpmnVersionPreview` | `frontend/src/features/process/stage/ui/BpmnVersionPreview.jsx` | Правая панель: BPMN-Viewer + raw XML |
| `BpmnVersionActions` | `frontend/src/features/process/stage/ui/BpmnVersionActions.jsx` | Футер модалки истории |
| `BpmnVersionDiffOverlay` | `frontend/src/features/process/stage/ui/BpmnVersionDiffOverlay.jsx` | Semantic diff: minimaps + badges |

### 4.2 Модалка "История версий BPMN"

Двухколоночный layout:
- **Слева:** `BpmnVersionList` — скроллируемый список.
- **Справа:** `BpmnVersionPreview` — readonly `NavigatedViewer` с fit-to-viewport + переключатель XML.
- **Футер:** `BpmnVersionActions` — Обновить, Сравнить A/B, С текущей, Скачать, Восстановить, Закрыть.

### 4.3 Действия

#### Предпросмотр (клик по версии)
`ProcessStage.previewSnapshotVersion` устанавливает `previewSnapshotId` и лениво загружает XML через `ensureBpmnVersionXml`.

#### Скачать .bpmn
`ProcessStage.downloadSnapshot` создаёт Blob и вызывает скачивание файла `{title}_snapshot_{ISOstamp}.bpmn`.

#### Сравнить
`ProcessStage.openDiffForSnapshot` выбирает base = предыдущая версия в списке, target = выбранная версия, открывает diff-модалку и подгружает XML обеих.

#### Сравнить A/B
Выбирает base = вторая версия, target = первая версия в списке.

#### Восстановить
`ProcessStage.restoreSnapshot`:
1. Запрашивает подтверждение.
2. POST `/bpmn/restore/{version_id}` с `baseDiagramStateVersion`.
3. Перезаписывает текущую сессию XML из версии.
4. Создаёт **новую** пользовательскую версию с `source_action="restore_bpmn_version"`.
5. Синхронизирует backend и обновляет список версий.

**Важно:** восстановление не удаляет историю, а добавляет новую версию — действие обратимо.

### 4.4 Disabled-стейты

- **Восстановить** и **Сравнить с текущей** disabled для `currentVersionId`.
- **Сравнить A/B** disabled при `< 2` версий.
- Все кнопки disabled при `versionsBusy`.

---

## 5. Лимиты и ротация

### Backend
- **Нет удаления / ротации / retention-логики** для `bpmn_versions` и `session_state_versions`.
- Listing ограничен параметром `limit` (clamped `1–1000`).

### Frontend local snapshots
- `frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js`: лимит `SNAPSHOT_DEFAULT_LIMIT = 20`, дедупликация по хэшу, pruning при превышении.

---

## 6. Edge cases

| Сценарий | Поведение |
|----------|-----------|
| Версий нет | Показывается empty-state панель с сообщением из `revisionHistoryUiModel.resolveRevisionHistoryEmptyState` |
| Версия одна | Кнопки "Сравнить A/B" и "Сравнить с текущей" disabled |
| Восстановление при несохранённых изменениях | Работает — текущая диаграмма заменяется; создаётся restore-версия |
| Undo/redo после восстановления | Стандартный undo/redo диаграммы не тестировался напрямую; восстановление само по себе создаёт новую версию, которую можно снова восстановить |
| Технические версии | Скрыты из UI истории, но хранятся в БД |

---

## 7. Скриншоты

Скриншоты сняты Playwright-скриптом `/root/ui_verify/capture_bpmn_versions_stage.js` на `http://clearvestnic.ru:5177` (admin@local / admin).

### 7.1 Модалка истории версий (начальное состояние)

![03_versions_modal.png](03_versions_modal.png)

- Версии: 4
- Первая версия помечена как "текущая", остальные — "устаревшие"
- Каждая карточка: название, дата, автор, хэш, размер, действия

### 7.2 Предпросмотр выбранной версии

![04_version_preview.png](04_version_preview.png)

- Справа отображается BPMN-диаграмма
- В заголовке: размер XML и кнопка "XML"
- После выбора версии подгружается XML и рендерится viewer

### 7.3 Семантический diff (A/B)

![05_diff_overlay.png](05_diff_overlay.png)

- Сверху селекторы версий A и B
- Слева минимапы A и B
- Справа основная диаграмма с overlay-бейджами
- В данном примере между версиями нет семантических изменений (`+0 −0 Δ0`)

---

## 8. Найденные проблемы / странности

1. **Несоответствие номеров версий в UI.**
   - В списке отображаются user-facing номера (`Версия 11`, `Версия 10`, `Версия 9`).
   - После клика и загрузки полной XML preview-панель может показать другой номер (`Версия 491`), потому что `normalizeBpmnVersionListItem` при detail-загрузке переопределяет `revisionNumber` техническим `version_number`, если user-facing номер отсутствует в детальном ответе.
   - Это может путать пользователя.

2. **Размер `0 B` для невыбранных версий.**
   - В списке невыбранные версии показывают `0 B`, потому что XML загружается лениво, а `len` вычисляется только если XML уже есть.
   - После клика размер появляется.
   - Можно улучшить: показывать размер из заголовка версии, если backend его возвращает.

3. **Нет кнопки "Сохранить сейчас" в empty-state.**
   - `BpmnVersionList` поддерживает `onSaveSession`, но `ProcessDialogs` не передаёт этот проп.
   - При пустой истории пользователь не может быстро создать первую версию из модалки.

4. **Нет backend-ротации версий.**
   - Все `bpmn_versions` и `session_state_versions` накапливаются в SQLite без cleanup.
   - Долгосрочно это может привести к росту БД и замедлению listing.

5. **Restore неявно создаёт новую версию.**
   - Это хорошо для аудита, но неочевидно для пользователя: после "Восстановить" в истории появляется ещё одна строка.

6. **Diff overlay показывает `+0 −0 Δ0` для визуально разных версий.**
   - Semantic diff сравнивает только задачи, лейны, подпроцессы и sequence flow/условия.
   - Если версии отличаются только метаданными, позициями элементов, документами или заметками — diff покажет 0 изменений.
   - Это ожидаемое поведение, но стоит явно сообщать пользователю, что сравнивается именно семантика процесса.

7. **Нет hard/soft-delete версий.**
   - Пользователь не может удалить версию.
   - `editSnapshotLabel`, `togglePinSnapshot`, `clearSnapshotHistory` в UI присутствуют, но являются no-op с информационными тостами "журнал неизменяем".

---

## 9. Выводы

Система версий BPMN в ProcessMap построена по принципу **immutable append-only журнала**:

- Каждое изменение XML создаёт запись в `bpmn_versions`.
- Только явные действия (`publish_manual_save`, `import_bpmn`, `restore_*`) считаются пользовательскими и показываются в UI.
- Технические сохранения (`manual_save`, autosave, export_regenerate) скрыты из истории, но хранятся в БД.
- Восстановление не откатывает историю, а создаёт новую restore-версию поверх текущего состояния.
- Frontend предоставляет просмотр, скачивание, сравнение A/B и восстановление.
- Основные риски: неограниченный рост таблиц и путаница с user-facing/техническими номерами версий в UI.

---

## 10. Ссылки на исходный код

| Что | Где |
|-----|-----|
| Схема `sessions` | `backend/app/storage.py:1363–1406` |
| Схема `bpmn_versions` | `backend/app/storage.py:1446–1468` |
| Создание версии | `backend/app/storage.py:4927–5023` |
| Решение о создании версии | `backend/app/_legacy_main.py:7359–7403` |
| Пользовательские действия | `backend/app/_legacy_main.py:7328–7343` |
| Restore | `backend/app/_legacy_main.py:7840–7982` |
| Список версий backend | `backend/app/_legacy_main.py:7710–7796` |
| Классификатор действий frontend | `frontend/src/features/process/stage/ui/revisionEventClassifier.js` |
| UI модель истории | `frontend/src/features/process/stage/ui/revisionHistoryUiModel.js` |
| Контейнер с логикой | `frontend/src/components/ProcessStage.jsx` |
| Модалка истории | `frontend/src/features/process/stage/ui/ProcessDialogs.jsx` |
