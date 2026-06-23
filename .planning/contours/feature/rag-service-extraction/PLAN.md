# PLAN: RAG Service Extraction — Phase 1

## Candidate

**RAG service** (`feature/rag-service-extraction`)

| Factor | Auth | RAG | Workspace |
|---|---|---|---|
| Code size | ~1,160 LOC | ~785 LOC | ~3,940+ LOC |
| Outbound dependencies | High | Low | Very high |
| Inbound dependencies | Very high | Very low | Very high |
| Data isolation | Fair | **Excellent** | Poor |
| Risk if extraction breaks | Catastrophic | Low | Catastrophic |

RAG is the safest Phase 1: it owns dedicated tables, no other module calls it at runtime, and the existing `rag_settings.enabled` flag gives an immediate kill switch.

---

## Goal

Move the RAG subsystem into a standalone deployable service while keeping the public `/api/rag/*` contract intact. The monolith keeps serving as a gateway during transition; clients see no breaking change.

---

## Scope

### Moves to the new service

- `backend/app/rag/chunker.py`
- `backend/app/rag/indexer.py`
- `backend/app/rag/search.py`
- `backend/app/rag/storage_rag.py`
- Public RAG endpoints relocated:
  - `GET /api/rag/search`
  - `POST /api/rag/index`
  - `POST /api/rag/product-actions/index`
- Admin RAG settings endpoints (currently in `routers/admin.py`):
  - read/update `rag_settings`

### Stays in the monolith

- `sessions` table and session read model.
- Auth/org validation (`require_authenticated_user`, `request_active_org_id`, `require_org_member_for_enterprise`).
- Session-to-text extraction helper that feeds RAG indexing (this becomes an internal producer/consumer boundary).

### Shared during transition

- Public `/api/rag/*` routes remain in the monolith as a thin proxy.
- Monolith forwards requests to the RAG service via internal HTTP.
- If the RAG service is unavailable, the gateway falls back to the local implementation behind `rag_settings.enabled`.

---

## API Contract

### Public (gateway, unchanged)

```http
GET  /api/rag/search?q=...&top_k=...&source_type=...&session_id=...&min_score=...
POST /api/rag/index
POST /api/rag/product-actions/index
```

### Internal (RAG service)

```http
GET  /internal/rag/search?org_id=...&q=...&top_k=...&source_type=...&session_id=...&min_score=...
POST /internal/rag/index
POST /internal/rag/product-actions/index
GET  /internal/rag/settings/{org_id}
PUT  /internal/rag/settings/{org_id}
```

The internal API is **org-scoped**, not user-scoped. The monolith gateway validates the caller and forwards `org_id`, service token, and original payload.

---

## DB Boundary

### Tables owned by RAG service

- `rag_documents`
- `rag_chunks`
- `rag_embeddings`
- `rag_sources`
- `rag_feedback`
- `rag_eval_cases`
- `rag_settings`

### Tables owned by monolith (read-only from RAG service)

- `sessions` — RAG service may read `bpmn_xml` and `interview.analysis.product_actions` via internal API or a read replica/snapshot.

### Migration plan

1. Create RAG service schema (same SQLite/Postgres tables).
2. Export existing `rag_*` data from monolith.
3. Import into RAG service DB.
4. Switch gateway proxy from local fallback to RAG service.
5. Keep monolith `rag_*` tables as read-only archive until rollback window closes.

---

## Rollback Plan (≤5 min)

1. **Feature flag:** set `rag_settings.enabled = false` in monolith DB → all RAG endpoints return `{"ok": false, "error": "rag_disabled", "results": []}` instantly.
2. **Proxy switch:** change gateway `RAG_SERVICE_URL` env to empty → monolith uses local RAG implementation again.
3. **DB revert:** if data was migrated, the monolith still holds the pre-migration tables; re-point reads back to them.
4. **No client impact:** search degrades gracefully to empty results; indexing jobs are idempotent and can be replayed.

---

## Execution Phases

### Phase 1 — Service shell (this plan)

- Create `services/rag/` package with FastAPI app.
- Move `rag/*` modules and storage functions.
- Add internal endpoints.
- Add monolith proxy with local fallback.
- Docker Compose service + healthcheck.
- No production deploy.

### Phase 2 — Data migration

- Schema + seed migration.
- Add org-scoped service token.
- Proxy toggle in `deploy/`.

### Phase 3 — Cleanup

- Remove local RAG implementation from monolith.
- Drop `rag_*` tables from monolith DB (after backup).

---

## Acceptance Criteria

- [ ] `docker compose up rag` starts and healthcheck passes.
- [ ] `GET /api/rag/search` returns identical results before and after proxy toggle.
- [ ] `POST /api/rag/index` succeeds and writes to RAG service DB.
- [ ] Disabling `rag_settings.enabled` returns empty results without 500s.
- [ ] Rollback proxy switch restores local behavior in <5 min.
- [ ] **No production deploy without explicit user approve.**
