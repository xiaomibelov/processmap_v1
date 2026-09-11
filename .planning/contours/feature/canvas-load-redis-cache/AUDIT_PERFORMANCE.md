# Performance Audit — Canvas / Session Load (`feature/canvas-load-redis-cache`)

**Date:** 2026-06-22
**Scope:** Frontend first paint, network waterfall, backend endpoint timing, DB query patterns, heavy compute on the session-open path.
**Test stand:** `http://clearvestnic.ru:5177` / `https://stage.processmap.ru`
**Branch:** `feature/canvas-load-redis-cache` off `new-origin/main`

---

## 1. Executive summary

Opening a BPMN session currently triggers **≈46 network requests** and downloads **≈4.83 MB** before the user can interact with the canvas. Most of this is backend JSON/XML payload, not static assets. On the test stand the absolute latency is moderate (no request > 260 ms) because the database has almost no large `bpmn_xml` rows. However, **static analysis of the backend shows several latency land-mines that scale with XML/meta size** and explain >20 s timeouts reported for real production sessions:

1. `GET /api/sessions/{id}` loads the **entire** `sessions` row (`SELECT *`) including `bpmn_xml`, `bpmn_meta_json`, `interview_json`, `notes_json`, etc., even though it only needs metadata.
2. The session JSON response is produced by `sess.model_dump()` + `_normalize_bpmn_meta()` on every call.
3. `GET /api/sessions/{id}/bpmn` (non-raw) parses the full XML, removes and re-adds interview annotations, and may **regenerate the XML from nodes/edges synchronously** before saving a new version.
4. `GET /api/sessions/{id}/auto-pass/precheck` parses the full XML and runs a graph reachability analysis on every session open.
5. Redis caching exists for explorer, overlays and TLDR, but **the hot `GET /api/sessions/{id}` live route is not cached**.

**Recommendation:** implement a Redis-backed projection cache for the session open payload, separate raw BPMN XML caching from annotated overlay generation, and defer non-critical prechecks.

---

## 2. Methodology

- Frontend: Playwright Chromium trace + HAR capture while navigating to a session canvas.
- Backend: Log inspection and static code analysis across routers, services, `_legacy_main.py`, `storage.py`, `overlay_cache.py`, `auto_pass_engine.py`.
- DB: SQLite size analysis (see data-limitations note below).

---

## 3. Frontend metrics

| Metric | Value |
|---|---|
| Total requests | ~46 |
| Total transferred | ~4.83 MB |
| `loadEventEnd` (local Chromium, cold cache) | ~114 ms |
| DOM content loaded | ~113 ms |

> The absolute numbers are small on the test stand because the data set is tiny. The important finding is the **request count and payload shape**, not the current millisecond values.

### Slowest / largest requests observed

| Endpoint | Time (ms) | Size | Note |
|---|---|---|---|
| `GET /api/explorer?workspace_id=...` | 254 / 150 | ~110 KB each | Loads workspace/folder/project/session tree. Cached partially in Redis. |
| `POST /api/sessions/{id}/presence` | 135 | small | Upsert + prune of presence rows. |
| `GET /api/sessions/{id}/auto-pass/precheck` | 134 | small | Parses full BPMN XML + reachability graph. |
| `GET /api/sessions/{id}/note-threads` | 133 | varies | Loads threads, comments, mentions, reads. |
| `GET /api/sessions/{id}/bpmn/versions?limit=1` | 107 | small | Used to detect stale client data. |
| `GET /api/sessions/{id}/bpmn?raw=1` | 106 | XML size | Raw BPMN XML. |

The session’s own metadata endpoint (`GET /api/sessions/{id}`) was < 70 ms in the test data, but only because there was no `bpmn_xml` to ship.

---

## 4. Backend call graph & query counts

| Endpoint | Entry point | DB queries | Big payload? |
|---|---|---|---|
| `GET /api/sessions/{id}` | `routers/sessions.py:58` → `session_service.get_session` | 1–2 | Yes — full row |
| `GET /api/sessions/{id}/bpmn` | `routers/sessions.py:164` → `session_service.bpmn_export` | 1 + overlay fetch + possible writes | Yes — XML |
| `GET /api/sessions/{id}/bpmn/versions` | `routers/sessions.py:176` | 3 | No if `include_xml=0` |
| `GET /api/sessions/{id}/note-threads` | `routers/notes.py:332` | 2–7 | Medium |
| `GET /api/sessions/{id}/auto-pass/precheck` | `routers/auto_pass.py:339` | 1 | No, but CPU heavy |
| `POST /api/sessions/{id}/presence` | `routers/sessions.py:62` | 4 | No |
| `GET /api/explorer` | `routers/explorer.py:491` | 0–4+ (cache-aside) | Medium |

---

## 5. Key findings

### 5.1 Full-row SELECT on every session read

`storage.py:2863` `Storage.load()` executes:

```sql
SELECT * FROM sessions WHERE id = ? ...
```

This pulls `bpmn_xml`, `bpmn_meta_json`, `interview_json`, `nodes_json`, `edges_json`, `questions_json`, `notes`, `normalized_json`, `resources_json`, `analytics_json`, `ai_llm_state_json`, and multiple `mermaid_*` columns even when the caller only needs the session header. There is **no projection variant** on the hot path.

### 5.2 `_session_api_dump` normalises large meta on every call

`_legacy_main.py:836` produces the response by calling:

```python
sess.model_dump()
_normalize_bpmn_meta(sess.bpmn_meta)
```

`_normalize_bpmn_meta` (`_legacy_main.py:2974`) iterates `flow_meta`, `node_path_meta`, `robot_meta_by_element_id`, `hybrid_layer_by_element_id`, `hybrid_v2`, `drawio`, `auto_pass_v1`. Cost is O(size of meta). On large sessions this alone can take seconds.

### 5.3 BPMN export can regenerate XML synchronously

`session_bpmn_export` (`_legacy_main.py:7169`) may call `export_session_to_bpmn_xml()` to rebuild XML from nodes/edges, then snapshot and save a new `bpmn_versions` row synchronously inside the GET handler.

### 5.4 Overlay generation parses and mutates full XML

`_overlay_interview_annotations_on_bpmn_xml` (`_legacy_main.py:534`) does:

```python
ET.fromstring(xml)
# remove old annotations, add new ones
ET.tostring(...)
```

This happens on every non-raw BPMN export unless the overlay cache hits.

### 5.5 Auto-pass precheck runs full graph analysis on open

`compute_auto_pass_precheck` (`auto_pass_engine.py:259`) parses the BPMN XML, builds sequence/message graphs, and runs BFS reachability to end events. It is invoked during canvas load even though its result is only needed when the user interacts with auto-pass features.

### 5.6 Note-threads loads all comments and filters in Python

`storage.py:8345` issues `SELECT *` on `note_threads`, `note_comments`, `note_comment_mentions`, then filters by `element_id` in Python (`storage.py:8451`).

### 5.7 Explorer uses `SELECT *` for session list

`list_project_sessions_for_explorer` (`storage.py:10465`) materialises full `Session` models just to extract a few explorer fields.

### 5.8 Redis cache already exists but is not used for the live session route

- `redis_cache.py` has helpers: `session_open_cache_key`, `tldr_cache_key`, explorer segment caches.
- `overlay_cache.py` caches overlay XML and overlays JSON.
- `GET /api/sessions/{id}` is served by `routers/sessions.py` → `session_service.get_session` and **does not call any Redis cache helper**.
- The deprecated `_legacy_main.py:3882` route that did use `session_open_cache_key` is no longer registered in `app_factory.py`.

---

## 6. Risk matrix

| Symptom | Root cause | Explodes when | Proposed fix area |
|---|---|---|---|
| `GET /api/sessions/{id}` > 5–20 s | Full-row SELECT + model_dump + meta normalisation | `bpmn_xml` / `bpmn_meta_json` large | Projection + Redis cache |
| `GET /api/sessions/{id}/bpmn` > 10 s | Synchronous XML regeneration + overlay annotation | XML > 1 MB | Raw XML cache; async overlay |
| `GET /api/sessions/{id}/auto-pass/precheck` blocks canvas | Full XML parse + graph reachability on open | Large/complex graphs | Lazy/deferred precheck |
| `GET /api/explorer` slow | Full row hydration for explorer | Many sessions in project | Use summary projection + cache |
| Memory spikes | `SELECT *` + Pydantic model dump | Large JSON/XML columns | Selective queries |

---

## 7. Data limitations

The default SQLite path `/root/processmap_v1/backend/workspace/.session_store/processmap.sqlite3` contains **0 sessions with non-empty `bpmn_xml`**. Therefore this audit is based on:

- Real frontend network capture against the test stand.
- Static backend analysis (file paths and line numbers verified in `feature/canvas-load-redis-cache`).

Production DB path / credentials were not available during this phase. Once access is provided, the same queries should be rerun against real data and the numeric findings updated.

---

## 8. Quick wins (no new infrastructure)

1. Add a `load_session_summary(id, columns=...)` helper and use it in `get_session` to avoid `SELECT *`.
2. Avoid `_normalize_bpmn_meta` on every dump; normalise once on write and store the canonical form.
3. Make `auto-pass/precheck` return a fast stub (`enabled: bool`) and load the full analysis on first user hover/click.
4. Add `element_id` filter to the SQL in `list_note_threads`.
5. Use `list_project_session_summaries` for explorer instead of `list_project_sessions_for_explorer`.

---

## 9. Recommended architecture direction

Implement a **Redis projection cache** for the session-open payload plus **selective DB queries**. Three architecture options are detailed in `CACHE_ARCHITECTURE.md`. No code should be written until one option is explicitly approved.
