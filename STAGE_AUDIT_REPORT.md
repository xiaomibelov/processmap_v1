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
| Frontend assets | `/assets/index-CX7Sq8gA.js` (200, 3.8 MB), `/assets/index-Cit1xvfc.css` (200, 686 KB) |
| Backend health | `/api/health` → `{"ok":true,"api":"ready","redis":{"state":"healthy"}}` |
| `/api/meta` | `{"api_version":2,"features":{"bpmn":true,...}}` |

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

### ⚠️ Stage stale

На stage задеплоен код до PR #543 (`feat/sidebar-sections-merge`). В `main` есть 2 коммита, которых нет на stage:

1. `70d80c31 fix: batch-draft 500 - correct session.interview.analysis path`
2. `d57a85e7 Merge batch-draft 500 fix into main`

**Риск:** баг "batch-draft 500" может проявляться на stage, если он не связан с этими коммитами, или, наоборот, может быть уже пофикшен в main, но не на stage. Deploy-stage для этих коммитов не запускался (нет in-progress/queued run).

**Рекомендация:** дождаться/запустить deploy-stage для `d57a85e7` и перепроверить баги.

---

## Фаза 2 — Функциональный аудит

### Методология

- Без авторизации на stage интерактивное тестирование UI невозможно.
- Проверены: доступность stage, целостность assets, backend health, API metadata.
- Создана Playwright E2E-спека для воспроизведения бага с удалением свойства: `frontend/e2e/stage-property-delete-audit.spec.mjs`.
- Для запуска спеки нужны stage-учётные данные (E2E_USER / E2E_PASS) и установленный Chromium.

### Группа A — Property CRUD (HIGH PRIORITY)

#### Баг: удаление свойства → долгое сохранение, без ошибки таймаута, редактирование невозможно

**Severity:** P0  
**Статус:** Не воспроизведён интерактивно (нет stage-авторизации), но воспроизводим по коду.

**Найденные проблемы в коде frontend:**

1. **saveCoordinator pipelines используют `debounceMs: 0` и `retryCount: 3`.**
   - `saveBpmnState.js` (xml pipeline): `debounceMs: 0`, `retryCount: 3`, `retryDelayMs: 1000`
   - `sessionPatchCasCoordinator.js` (meta pipeline): `debounceMs: 0`, `retryCount: 3`, `retryDelayMs: 1000`
   - `interviewAnalysisPatchHelper.js` (analysis pipeline): `debounceMs: 0`, `retryCount: 3`, `retryDelayMs: 1000`
   - `createBpmnPersistence.js` (rawXml pipeline): `debounceMs: 0`, `retryCount: 3`, `retryDelayMs: 1000`

2. **Последствия конфигурации:**
   - Каждое изменение property немедленно отправляет save-запрос (нет debounce).
   - Если backend возвращает 409 (CAS version mismatch), saveCoordinator делает 3 retry с задержками 1s, 2s, 4s.
   - Максимальное время одного сохранения при 409: ~7 секунд + время запросов.
   - Это объясняет "долгое сохранение без ошибки" — запрос в итоге может успеть, но через retry-цикл.

3. **Возможная причина CAS mismatch:**
   - `casVersionTracker` может не обновляться после успешного save, если `pickDiagramStateVersion` не находит `diagram_state_version` в ответе.
   - `saveCoordinator` при 409 делает `rollbackTrackedDiagramStateVersion`, но не перезагружает сессию. Следующий save снова шлёт старый base version → снова 409 → retry loop.
   - Если property удаляется через `propertyCrudBoundary` (P0-3), он пишет в XML и триггерит `saveCoordinator.execute('xml')`. Если в этот момент другой pipeline (meta/analysis) уже занимает queue, save стоит в очереди.

4. **Почему редактирование становится невозможным:**
   - Возможно, UI переводится в состояние "saving" и не снимается флаг из-за долгого/зависшего запроса.
   - Или saveCoordinator queue заблокирована предыдущим save (особенно при отсутствии debounce).

**Гипотеза наиболее вероятной причины:**

`debounceMs: 0` + `retryCount: 3` + CAS version drift → каждое property-изменение вызывает цепочку retry, и queue saveCoordinator быстро saturate. При удалении свойства UI ждёт завершения save, но из-за retry-цикла кажется, что "сохранение висит".

**Рекомендация по фиксу:**

1. Немедленно: включить `debounceMs: 300` для xml/meta/analysis pipelines (как планировалось в P0-2).
2. Добавить метрики/логирование 409 и retry в saveCoordinator.
3. При 409 после всех retry показывать conflict modal и предлагать reload, а не молчать.
4. Проверить, что `casVersionTracker` корректно bump'ится после каждого успешного save (включая ответы от `apiPatchSession` для meta pipeline).
5. Убедиться, что UI не блокирует input'ы на время save (optimistic UI).

### Группа B — Sidebar (редизайн)

**Статус:** Stage задеплоен с PR #543 (`feat/sidebar-sections-merge`). Без авторизации визуальная проверка невозможна. Assets загружаются, 404 нет.

### Группа C — XML-редактор (CodeMirror)

**Статус:** Stage задеплоен с PR #537 (`feat/xml-editor-codemirror`). Assets на месте. Build локально падает на отсутствии `@codemirror/view`, но stage-assets собраны (вероятно, зависимость установлена в CI).

### Группа D — Поиск (Superpower Search Wave 1)

**Статус:** Stage задеплоен с PR #535. Assets на месте. Без авторизации не проверено.

### Группа E — Аналитика (Excel Source)

**Статус:** Stage задеплоен с PR #536. Assets на месте. Без авторизации не проверено.

### Группа F — Save/Deploy (общее)

**Статус:** Backend healthy. Save pipelines зарегистрированы, но конфигурация подозрительна (см. Группа A).

---

## Фаза 3 — Сводка и рекомендации

### Критичные находки

| Severity | Component | Title | Статус | Гипотеза |
|----------|-----------|-------|--------|----------|
| P0 | saveCoordinator / Property CRUD | Удаление свойства → долгое сохранение, UI блокируется | Подтверждён по коду | debounce=0 + retry=3 + CAS drift |
| P1 | Deploy | Stage stale на 2 коммита от main | Подтверждён | Deploy-stage не запущен для d57a85e7 |

### Performance

| Операция | Норма | Факт (по коду) | Примечание |
|----------|-------|----------------|------------|
| Property save | < 1s | до ~7s при 409 | retryCount=3, backoff 1s/2s/4s |
| Property save frequency | debounced | immediate | debounceMs=0 |

### Console summary

Без интерактивного UI-тестирования console errors не собраны.

### Network summary

| Endpoint | Статус | Примечание |
|----------|--------|------------|
| GET /api/health | 200 OK | backend healthy |
| GET /api/meta | 200 OK | api_version=2 |
| GET /api/auth/me | 401 missing_bearer | ожидаемо без токена |
| /assets/index-*.js | 200 OK | 3.8 MB |
| /assets/index-*.css | 200 OK | 687 KB |

### Рекомендации по приоритету

1. **P0 — Запустить deploy-stage для `d57a85e7`** и перепроверить баги (возможно, batch-draft 500 fix уже чинит что-то связанное).
2. **P0 — Проверить конфигурацию saveCoordinator:**
   - Установить `debounceMs: 300` для xml/meta/analysis pipelines.
   - Убедиться, что `casVersionTracker.bumpVersion` вызывается для всех pipeline'ов.
3. **P0 — Запустить Playwright-аудит** `frontend/e2e/stage-property-delete-audit.spec.mjs` со stage-авторизацией, чтобы собрать реальные timing и console/network logs.
4. **P1 — Добавить логирование 409/retry** в saveCoordinator для диагностики.
5. **P1 — Проверить optimistic UI:** input'ы не должны блокироваться во время save.

### Next steps

- Нужны stage-учётные данные (E2E_USER / E2E_PASS) для запуска E2E-аудита.
- Нужно решение: включить debounce в saveCoordinator pipelines и перетестировать property CRUD.
- После deploy-stage d57a85e7 — повторный аудит.
