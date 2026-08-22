# Agent 2 (Worker) — Contour: stage8/test-devserver-1781309007

## Mission
Execute the bounded dev-server smoke-test plan in `PLAN.md`. You are the sole Worker; there is no other Agent 2.

## Pre-Flight Checklist
- [ ] `cd /opt/processmap-test`
- [ ] Read `PLAN.md` fully
- [ ] Read `.agents/tests/test_stage8_dev_server.sh`
- [ ] Confirm `curl` is available (`command -v curl`)

## Environment Defaults
- Dev server URL: `http://localhost:5177/`
- Request timeout: 5 seconds
- Container note: `/app` in the test container maps to `/opt/processmap-test/frontend` on the host.

## Tasks

### 1. Source/runtime truth
Record in `RUNTIME_PROOF_CHECKLIST.md`:
- `git branch --show-current`
- `git rev-parse HEAD`
- `git status -sb`

### 2. Dev server HEAD probe
Run:
```bash
curl -I --max-time 5 http://localhost:5177/ 2>&1
```
Record in `RUNTIME_PROOF_CHECKLIST.md`:
- Full status line (e.g., `HTTP/1.1 200 OK`)
- `Date` header value
- `Server` header value
- `Content-Type`
- `Content-Length`
- `Cache-Control` and related anti-cache headers

### 3. Dev server GET probe
Run:
```bash
curl -sf --max-time 5 http://localhost:5177/ 2>&1 | head -c 500
```
Record:
- That `index.html` body is returned
- First line of the body (e.g., `<!doctype html>` or `<script ...>`)
- Body length (use `wc -c` if needed)

### 4. Handle unreachable server (environment-dependent)
If `curl` returns no response within the timeout:
- Record the exact command and output
- Mark the contour as environment-dependent unreachable
- Do **not** modify product code or attempt to start the server
- Set `worker_status` to `complete` with a clear note in `RUNTIME_PROOF_CHECKLIST.md`

### 5. Fill `RUNTIME_NAVIGATION.md`
Document:
- Exact URL tested: `http://localhost:5177/`
- HTTP method(s) used: `HEAD` then `GET`
- Expected response: HTTP 200 with `text/html` body
- Any login or setup steps required: none for this smoke test

### 6. Fill `RUNTIME_PROOF_CHECKLIST.md`
Use the acceptance criteria from `PLAN.md` as the checklist. Mark each item `PASS`, `FAIL`, or `N/A`, with verbatim evidence.

### 7. Update `STATE.json`
Set `worker_status` to `complete` or `blocked`.

## Constraints
- **NO product code changes.** This is a validation/test contour only.
- **NO merge / deploy / PR.**
- Do not start, restart, or reconfigure the dev server.
- If runtime is missing, capture the failure verbatim and halt with a clear note.

## Deliverables
- `RUNTIME_NAVIGATION.md`
- `RUNTIME_PROOF_CHECKLIST.md`
- Updated `STATE.json`

## Dev Server Requirement

Before creating `WORKER_DONE`, ensure the dev server on `:5177` is running and serves the current build. Check the `Date` response header; if it is stale (>1 minute old) or the server is down, start the dev server (`npm run dev` or equivalent in the frontend directory).
