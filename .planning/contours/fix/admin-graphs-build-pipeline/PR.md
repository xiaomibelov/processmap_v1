## Что делает

Реализует вариант A из PLAN.md: загрузка готовых артефактов `graph.json` + `.graphify_analysis.json` через `POST /api/admin/graphs/snapshots`, их валидация, сохранение и фоновый рендер `graph.html`, а также UI-раздел загрузки в админке.

### Backend
- `POST /api/admin/graphs/snapshots` — multipart upload, только admin.
- Валидация `graph.json` (`nodes` + `links`/`edges`) и `.graphify_analysis.json` (`communities` обязательна, `raw_nodes`/`raw_edges` опциональны).
- Fallback `total_nodes`/`total_edges` из `graph.json`, если анализ не содержит счётчики.
- `list_snapshots()` больше не дублирует `current`-симлинк.
- Корректный поиск `graphify-semantic-config.json` в Docker-раскладке (`/app/tools`) для `layer_gaps`.

### Frontend
- Раздел «Загрузить снапшот» на `/admin/graphs`.
- Отображение истории снапшотов и аналитики.

### Gateway
- `client_max_body_size 50m` и таймаут 300s для `/api/admin/graphs/snapshots`.

### Тесты
- Backend: `backend/tests/test_admin_graphs.py` — **20 passed**.
- Frontend smoke: `AdminGraphsPage.smoke.test.jsx` — **8 passed**.

## Stage-верификация

- ✅ Образы `processmap_stage-api:e991d99c` / `processmap_stage-frontend:e991d99c` развёрнуты.
- ✅ `POST /api/admin/graphs/snapshots` с 33 МБ `graph.json` → `200`, HTML отрендерен.
- ✅ `GET /api/admin/graphs/snapshots` → `200`, без дублирования.
- ✅ `GET /api/admin/graphs/analytics` → `200`, `total_nodes=19954`, `total_edges=55681`.
- ✅ `GET /api/admin/graphs/snapshot/current/html` — admin `200`, viewer `403`.
- ⚠️ Финальные UI-скриншоты и докат образа `25650e02` (layer_gaps config fix) не удались: `stage.processmap.ru` (45.87.104.69) стал недоступен (SSH таймаут, HTTPS `SSL_ERROR_SYSCALL`, ICMP loss). После восстановления stage нужно пересоздать api-контейнер на `25650e02` и перезалить снапшот.

## Git-proof

```
branch: fix/admin-graphs-build-pipeline
HEAD: fa402644
base: origin/main (7edec2c2)
```

**Merge только по явному approve.**
