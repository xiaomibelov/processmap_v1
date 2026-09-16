# PR (черновик) — feature/async-save-pipeline-step2

> Открывается после явного approve владельца. Язык PR — русский.

**Title:** feat(save): персистентный outbox (IndexedDB) + мультипользовательская конвергенция — async-save step2

**Body (черновик):**

## Что

Step2 save-пайплайна: локальный буфер правок диаграммы стал персистентным (IndexedDB `pm-save-outbox`), сеть ушла из критического пути подтверждения правки; добавлена доставка чужих операций через существующий SSE-канал (`ops_committed`) для мультипользовательской конвергенции. Закрыто наследие step1 (6 пунктов).

## Ключевое

- **Персистентность:** журнал ops/syncState/proposed в IndexedDB; запись правки = мгновенное локальное подтверждение (sync p95 0.20 мс); eviction только после ack; гидрация + догон после F5/kill вкладки/обрыва сети.
- **Кто новее при входе:** 4-веточная reconciliation-политика (дельты поверх seenServerVersion / fetch+rebase при чужих правках).
- **Мультипользовательская модель:** сервер — единственный источник истины; `ops_committed` по SSE с Redis pub/sub fan-in (multi-worker); конкурирующие батчи — optimistic locking по baseVersion; конфликт на elementId — LWW по серверной версии, проигравшая op уходит в «предложенные изменения» (не молча); soft-lock элемента через presence (heartbeat 15 s, TTL 60 s, advisory); два таба = два клиента (opId-дедупликация); CRDT не вводится (decision record в PLAN §6.7).
- **Граница инлайна:** ops инлайнятся в событие до 50 шт; сверх — `full=true` + version+fetch.
- **Наследие step1:** pendingAck-детач (undo в окне RTT), version-based→snapshot reconciliation ручного full-save, parent re-embed после SQL-CAS commit, удалены dead keepalive-код и legacy route-дубль, org-explicit conflict reloads (#989-паттерн, все 4 сайта), `connection.reconnect` + client-generated id в op-vocabulary.

## Доказательства

- E2E: persistence 3/3 (kill/offline/reload — потерь 0), multiuser 5/5 (convergence, LWW+proposed, offline-catch-up, soft-lock, move-convergence с точными bounds), step1-регрессия 3/3 — **все на org ≠ default** (урок #989).
- Backend live-uvicorn acceptance 13/13 (409-XML вне дефолтной org, ops_committed по SSE, presence-поле).
- Бюджеты: тело ≤10 kB (факт 3722 B), p95 <300 мс (факт 138–204), coverage 1.00, 0 PUT вне fallback, 409-луп 0–1.
- Backend: 1722 passed (+34), failed-set идентичен baseline. Frontend: fail-set идентичен baseline.
- Review: Agent 3, вердикт **APPROVE** (2 BLOCKER'а + 3 MAJOR'а найдены и исправлены, re-review верифицировал).

## Риски

- Redis down ⇒ доставка ops_committed только внутри worker'а (версионный догон покрывает).
- `deploy-main-v1` (served) не содержит step1 — снятие drift'а отдельным контуром.
- canvas-editing-stability 7a/7b/5 — baseline-drift премис спеки (вне дельты), follow-up владельцу спеки.

## Чек-лист

- [x] `docs/openapi.yaml` регенерирован (`update_openapi.sh`, redocly 0 errors, diff 4 строки)
- [x] Тесты: unit + e2e + acceptance на org ≠ default
- [ ] BREAKING-API-OK — не требуется (аддитивно)
- [ ] Stage post-deploy верификация ключевых спеков (после merge, обязательна)
