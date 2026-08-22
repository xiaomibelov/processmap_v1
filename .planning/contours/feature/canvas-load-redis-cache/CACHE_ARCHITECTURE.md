# Cache Architecture — Canvas Load (`feature/canvas-load-redis-cache`)

**Date:** 2026-06-22
**Goal:** eliminate >20 s canvas open latency for large production sessions while keeping correctness and staying within the existing Redis/SQLite stack.

---

## 1. Principles

1. **Cache the expensive projection, not the ORM object.** Store only the JSON the frontend consumes.
2. **Version tokens, not fine-grained invalidation.** Cache key changes automatically when `session.version`, `session.bpmn_xml_version`, or `session.updated_at` change.
3. **Redis is a cache, not a source of truth.** On Redis failure the backend falls back to DB with the same code path.
4. **Defer non-critical work.** Auto-pass precheck and heavy overlays can be lazy.
5. **Minimal changes.** Reuse existing `redis_cache.py`, `overlay_cache.py`, and `session_repo.py` patterns.

---

## 2. Existing infrastructure to reuse

- `backend/app/redis_client.py` — env-driven Redis client (`REDIS_URL`), optional/fallback mode.
- `backend/app/redis_cache.py` — generic `cache_get_json` / `cache_set_json`, `session_open_cache_key`, `tldr_cache_key`, explorer caches, prefix invalidation.
- `backend/app/overlay_cache.py` — Redis-backed overlay XML/JSON caching.
- `backend/app/repositories/session_repo.py` — current loader; can be extended with a projection method.
- `backend/app/services/session_service.py` — new service layer; `get_session` is the natural place to add caching.

---

## 3. Proposed cache layers

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend                                                    │
│  - HTTP cache headers for /bpmn?raw=1 (immutable-ish token)  │
└──────────────┬───────────────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────────┐
│  FastAPI routers                                             │
│  - check in-memory / Redis cache for projection              │
└──────────────┬───────────────────────────────────────────────┘
               │ miss
┌──────────────▼───────────────────────────────────────────────┐
│  Service layer                                               │
│  - build projection from DB                                  │
│  - write to Redis with version token                         │
└──────────────┬───────────────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────────┐
│  Repository / storage                                        │
│  - selective queries (no SELECT * on hot path)               │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Architecture options

### Option A — Conservative: projection cache only (Recommended)

**What to build**

1. Add `SessionRepo.load_session_open_projection(session_id)` that selects only columns needed by `GET /api/sessions/{id}`:
   - `id, org_id, project_id, owner_user_id, title, status, version, bpmn_xml_version, updated_at, created_at, ...`
   - Excludes: `bpmn_xml`, `bpmn_meta_json`, `interview_json`, `nodes_json`, `edges_json`, `questions_json`, `notes_json`, `normalized_json`, `resources_json`, `analytics_json`, `ai_llm_state_json`, `mermaid_*`.
2. In `session_service.get_session`, compute `version_token` from `(version, bpmn_xml_version, updated_at)` and use `redis_cache.session_open_cache_key(session_id, version_token)`.
3. On cache miss, build the JSON with `repo.load_session_open_projection(...)` + `_session_api_dump` and store in Redis for 72 h (existing `session_open_cache_ttl_sec`).
4. On writes (save, patch, version bump) call `invalidate_session_open(session_id)`.
5. Keep overlay and explorer caches as-is.

**Pros**
- Minimal code churn; reuses existing helpers.
- Eliminates the full-row SELECT and meta dump on every session open.
- Safe: the version token guarantees stale reads only if a mutation fails to invalidate, and even then TTL is bounded.

**Cons**
- Does not cache raw BPMN XML (still hits DB for `/bpmn?raw=1`).
- Does not reduce auto-pass precheck cost.

**Files touched**
- `backend/app/repositories/session_repo.py` (+ projection loader)
- `backend/app/services/session_service.py` (+ cache read/write)
- `backend/app/routers/sessions.py` invalidation hooks (write endpoints)
- `backend/app/_legacy_main.py` write paths if they bypass routers.

**Est. effort:** 1–2 days.

---

### Option B — Balanced: projection cache + raw BPMN cache + deferred precheck

**What to build** (everything in A plus)

1. **Raw BPMN cache**
   - Add `session_bpmn_cache_key(session_id, bpmn_xml_version)`.
   - `GET /api/sessions/{id}/bpmn?raw=1` returns cached `bpmn_xml` if available; on miss loads from `bpmn_versions` (or `sessions.bpmn_xml`) and stores with 72 h TTL.
   - Invalidate on BPMN version bump or explicit save.
2. **Annotated overlay cache**
   - `GET /api/sessions/{id}/bpmn` (non-raw) reuses existing `overlay_cache.py`. Ensure the cache key includes the interview/question state version.
   - If overlay cache miss, fall back to current synchronous generation but return 202 + stream or keep sync for now.
3. **Defer auto-pass precheck**
   - Add query param `?lazy=1`.
   - Frontend calls `auto-pass/precheck` only after canvas is rendered; initial load returns `{enabled: true, ready: false}`.
   - Cache the precheck result by `(session_id, bpmn_xml_version)` for 5–15 min.

**Pros**
- Caches the largest payload (raw XML).
- Removes CPU-heavy work from the critical open path.
- Best cost/benefit for reported >20 s opens.

**Cons**
- Slightly more invalidation surface.
- Frontend needs a tiny change to defer precheck.

**Files touched**
- All files in Option A.
- `backend/app/routers/sessions.py` `/bpmn` endpoints.
- `backend/app/routers/auto_pass.py` `/precheck` endpoint.
- Frontend canvas load sequence.

**Est. effort:** 3–4 days.

---

### Option C — Aggressive: full session snapshot + background invalidation + HTTP CDN-friendly headers

**What to build** (everything in B plus)

1. **Full session snapshot**
   - Cache the entire composed session-open response (metadata + raw BPMN + overlay + note counts + presence) as a single Redis blob keyed by `(session_id, version_token)`.
   - Serve it as a single endpoint or pre-load bundle for the canvas.
2. **Background recompute**
   - On mutation, enqueue a background task (existing thread pool or Celery if available) to rebuild the snapshot and atomically replace the cache key; readers never wait on heavy computation.
3. **ETag / `Cache-Control`**
   - Return `ETag: <version_token>` and `Cache-Control: private, max-age=86400` for `/api/sessions/{id}` and `/api/sessions/{id}/bpmn?raw=1` so browser and any edge cache can reuse unchanged responses.

**Pros**
- Fastest possible repeat opens.
- Offloads the DB entirely for read-heavy sessions.

**Cons**
- Largest implementation and testing surface.
- Background task infra not currently present; Celery is not in the repo.
- Risk of serving stale composed snapshots if invalidation misses a path.

**Files touched**
- Many backend files; possible new worker module.
- Frontend caching logic.

**Est. effort:** 1–2 weeks.

---

## 5. Invalidation strategy

| Mutation | Action |
|---|---|
| `PATCH /api/sessions/{id}` | `invalidate_session_open(session_id)` |
| `PUT /api/sessions/{id}` | `invalidate_session_open(session_id)` |
| Save BPMN / bump `bpmn_xml_version` | `invalidate_session_open(session_id)` + delete raw-BPMN cache key |
| Note-thread change | delete cached note-threads segment if caching notes |
| Explorer tree change | existing `explorer_invalidate_*` helpers |
| Workspace move / org rename | existing workspace/org invalidation |

Version-token keys make many race conditions harmless: an old-token key simply misses and falls back to DB.

---

## 6. Monitoring & observability

Add small metrics around the new cache:

- `redis_cache.py` already tracks `hit / miss / set / delete / error / skip_no_client`.
- Add Prometheus/logging counters for:
  - `session_open_cache_hit`
  - `session_open_cache_miss`
  - `session_open_build_ms` (projection build time)
  - `bpmn_raw_cache_hit`
  - `bpmn_raw_cache_miss`
- Expose `/health/redis` already present via `redis_client.runtime_status()`.

---

## 7. Migration plan

1. Land Option A first.
2. Deploy to stage, measure `session_open_build_ms` and cache hit ratio.
3. If raw `/bpmn` still slow, land raw BPMN cache (Option B part 1).
4. If auto-pass precheck still blocks, add lazy/deferred mode (Option B part 2).
5. Re-evaluate Option C only if Option B is insufficient.

---

## 8. Decision required

Please approve **Option A**, **Option B**, or **Option C**. Implementation will not start until one is chosen.
