# Аудит stage.processmap.ru — post-merge regression check

Дата аудита: 2026-07-14
Аудитор: Kimi Code CLI
Ограничения: read-only audit, без изменения данных на stage.

---

## Фаза 1 — Статус деплоя

| Параметр | Значение |
|----------|----------|
| Stage URL | https://stage.processmap.ru |
| HTTP status | 200 OK |
| Last-Modified (HTML) | Tue, 14 Jul 2026 20:56:15 GMT |
| Frontend assets | /assets/index-CX7Sq8gA.js (200, 3.8 MB), /assets/index-Cit1xvfc.css (200, 686 KB) |
| Backend health | /api/health ok: api ready, redis healthy |
| /api/meta | api_version 2, bpmn enabled |

### Сравнение с main

```bash
git log main -1 --oneline
# d57a85e7 Merge batch-draft 500 fix into main
```

### GitHub Actions — deploy-stage

| Run | PR / trigger | Статус | Время (UTC) | Длительность |
|-----|--------------|--------|-------------|--------------|
| 29367571599 | #543 feat/sidebar-sections-merge | success | 2026-07-14T20:55:08Z | 1m16s |
| 29367533686 | #542 feat/unified-session-loader | success | 2026-07-14T20:54:33Z | 1m22s |
| 29367506513 | #541 feat/unified-property-crud-boundary | success | 2026-07-14T20:54:07Z | 1m16s |
| 29363174308 | #540 fix/reference-source-table-prefix | success | 2026-07-14T19:47:34Z | 59s |
| 29362000688 | #539 fix/unified-cas-version-tracker | success | 2026-07-14T19:29:24Z | 1m12s |

### Stage stale

На stage задеплоен код до PR #543 (feat/sidebar-sections-merge). В main есть 2 коммита, которых нет на stage:

1. 70d80c31 fix: batch-draft 500 - correct session.interview.analysis path
2. d57a85e7 Merge batch-draft 500 fix into main

Риск: баг batch-draft 500 может проявляться на stage.
Рекомендация: дождаться/запустить deploy-stage для d57a85e7.

---

## Фаза 2 — Функциональный аудит

### Методология

- Авторизация на stage через Playwright E2E (учётки предоставлены).
- Создана тестовая сессия через API; спека использует свежий fixture для каждого прогона.
- Playwright spec: frontend/e2e/stage-property-delete-audit.spec.mjs.
- Собраны: timing операций, console errors/warnings, network requests.

### Группа A — Property CRUD (HIGH PRIORITY)

#### Баг: сохранение свойства → 30 секунд без ответа, после этого удаление/добавление невозможны

**Severity:** P0  
**Статус:** Воспроизведён на stage.

**Шаги воспроизведения (E2E):**

1. Открыть тестовую сессию, выбрать Task_audit.
2. В sidebar раскрыть аккордеон "Свойства".
3. Кликнуть на строку свойства audit_prop → появляется режим редактирования.
4. Изменить значение на 15, нажать Enter.
5. Кликнуть кнопку "Сохранить" в нижней части sidebar.
6. Ожидать завершения сетевого запроса.

**Ожидаемое поведение:**

- Сохранение завершается за < 2 секунды.
- После сохранения кнопка удаления активна.
- Можно удалить свойство и сохранить.
- Можно добавить новое свойство.

**Фактическое поведение:**

- Клик "Сохранить" зависает ровно на 30 секунд (таймаут Playwright waitForResponse).
- Ответа от сервера не приходит.
- После таймаута кнопка удаления свойства остаётся disabled.
- Кнопка "Добавить BPMN-свойство" disabled.
- Новый input недоступен для редактирования.
- UI полностью заблокирован для дальнейших property-операций.

**Данные с прогона spec:**

```
[AUDIT] edit save elapsed: 30019 ms
[AUDIT] edit response status: none
[AUDIT] delete button enabled: false
[AUDIT] delete save elapsed: null ms
[AUDIT] delete response status: none
[AUDIT] second add save elapsed: null ms
[AUDIT] can add after delete: false
[AUDIT] input editable after delete: false
[AUDIT] console errors: []
[AUDIT] console warnings: []
[AUDIT] relevant requests:
  POST https://stage.processmap.ru/api/sessions/{session_id}/presence  56 ms  200
```

**Network summary:**

- Единственный запрос во время "сохранения": POST /api/sessions/{id}/presence (200, 56 ms).
- Запросов PUT /api/sessions/{id} или PATCH /api/sessions/{id}/bpmn не зафиксировано.
- То есть сохранение не уходит на backend вовсе, либо зависает до отправки.

**Console summary:**

- console.error: отсутствуют.
- console.warning: отсутствуют.
- Это указывает на "тихий" deadlock/freeze внутри frontend, а не на явную JS-ошибку.

**Гипотезы причины:**

1. **saveCoordinator deadlock.** При нажатии "Сохранить" saveCoordinator пытается выполнить xml/meta/analysis pipelines, но одна из очередей уже занята или заблокирована ожиданием версии. Из-за debounceMs=0 и отсутствия диагностики UI висит молча.
2. **casVersionTracker mismatch.** Перед отправкой saveCoordinator ждёт корректной версии, но casVersionTracker не обновился после загрузки сессии → ожидание никогда не завершается.
3. **XML pipeline infinite loop / sync.** propertyCrudBoundary (P0-3) модифицирует XML; возможно, applyElementCamundaExtensionsToModeler или последующий синхрос XML ↔ bpmnStoreRef зацикливается.
4. **Старый save path конфликтует с saveCoordinator.** Возможно, кнопка "Сохранить" вызывает старый saveBpmnState, который теперь конфликтует с saveCoordinator (P0-2), и оба ждут друг друга.

**Ответственный:** frontend (saveCoordinator / propertyCrudBoundary / sidebar save button wiring).

**Рекомендация по фиксу:**

1. Добавить таймаут и error logging внутрь saveCoordinator.execute (чтобы UI не висел 30+ секунд молча).
2. Проверить, что кнопка "Сохранить" в sidebar вызывает именно saveCoordinator.execute, а не устаревший saveBpmnState.
3. Проверить casVersionTracker: при load сессии версия должна быть установлена; при 409/ошибке — сброшена.
4. Временно включить verbose logging для saveCoordinator на stage (или локально) и повторить сценарий.
5. Проверить, что propertyCrudBoundary.setProperty не зацикливается на обновлении XML draft.

---

## Фаза 3 — Сводка и рекомендации

### Критичные находки

| Severity | Component | Title | Статус | Гипотеза |
|----------|-----------|-------|--------|----------|
| P0 | saveCoordinator / sidebar save | Сохранение свойства висит 30 секунд, после чего property CRUD блокируется | Воспроизведён на stage | Frontend deadlock/freeze: save не уходит на backend |
| P1 | Deploy | Stage stale на 2 коммита от main | Подтверждён | Deploy-stage не запущен для d57a85e7 |

### Performance

| Операция | Норма | Факт (stage) | Примечание |
|----------|-------|--------------|------------|
| Property edit save | < 2s | 30+ s timeout | Нет ответа от backend |
| Property delete after edit | < 2s | невозможно | UI disabled |
| Property add after failed save | < 2s | невозможно | UI disabled |

### Console summary

- console.error: 0
- console.warning: 0
- Поведение: "тихий" freeze без JS-ошибок.

### Network summary

| Endpoint | Метод | Статус | Время | Примечание |
|----------|-------|--------|-------|------------|
| /api/sessions/{id}/presence | POST | 200 | 56 ms | периодический heartbeat |
| /api/sessions/{id} (save) | PUT/PATCH | — | — | не зафиксирован |
| /api/sessions/{id}/bpmn | PUT/PATCH | — | — | не зафиксирован |

### Рекомендации по приоритету

1. **P0 — Расследовать saveCoordinator deadlock.** Нужны verbose logs или локальное воспроизведение с отладчиком.
2. **P0 — Запустить deploy-stage для d57a85e7** и перепроверить (хотя баг, скорее всего, на стороне frontend).
3. **P1 — Добавить diagnostics в saveCoordinator:** timeout, error toast, логирование всех pipeline-вызовов.
4. **P1 — Проверить wiring кнопки "Сохранить" в sidebar:** вызывает ли она saveCoordinator или старый saveBpmnState.

### Next steps

- Frontend: локально воспроизвести сценарий с включённым логированием saveCoordinator.
- Frontend: проверить casVersionTracker и propertyCrudBoundary на deadlock/loop.
- DevOps: запустить deploy-stage для main (d57a85e7).
- QA: после фикса перезапустить frontend/e2e/stage-property-delete-audit.spec.mjs.

---

## Артефакты

- Playwright spec: frontend/e2e/stage-property-delete-audit.spec.mjs
- Debug spec (использовался для поиска селекторов): frontend/e2e/_debug-sidebar.spec.mjs
- PR: #544 feat/stage-property-delete-audit
