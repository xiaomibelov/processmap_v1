# Runtime Proof Checklist: stage8/test-devserver-1781309535

## Source Truth

| Item | Value | Status |
|------|-------|--------|
| `pwd` | `/opt/processmap-test` | ✅ |
| `git remote -v` | `origin git@github.com:xiaomibelov/processmap_v1.git (fetch)` | ✅ |
| `git branch --show-current` | `test/agent-max-total-time` | ✅ |
| `git rev-parse HEAD` | `48f2950b8e2049797489f83c96b4af05b4323b1a` | ✅ |
| `git rev-parse origin/main` | `e1143c14f901882c12dc550f71bfd6757d60b882` | ✅ |
| `git merge-base HEAD origin/main` | `e1143c14f901882c12dc550f71bfd6757d60b882` | ✅ |
| `git status -sb` | `## test/agent-max-total-time...origin/main [ahead 1]` | ✅ |
| `git diff --name-only` | (empty) | ✅ |
| `git diff --cached --name-only` | (empty) | ✅ |

## Dev Server Probe

| Item | Value | Status |
|------|-------|--------|
| URL | `http://localhost:5177/` | ✅ |
| Status line | `HTTP/1.1 200 OK` | ✅ |
| `Date` header | `Sat, 13 Jun 2026 00:15:40 GMT` | ✅ |
| `Server` header | `nginx/1.27.5` | ✅ |
| `Content-Type` | `text/html` | ✅ |
| `Content-Length` | `439` | ✅ |
| `Cache-Control` | `no-cache, no-store, must-revalidate` | ✅ |
| `Pragma` | `no-cache` | ✅ |
| `Expires` | `0` | ✅ |
| Body present | Yes (non-empty HTML) | ✅ |
| Body first line | `<!doctype html>` | ✅ |

## Acceptance Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Source/runtime truth captured | ✅ | Recorded in Source Truth table above |
| 2 | Dev server is reachable | ✅ | `HTTP/1.1 200 OK` from `curl -I` |
| 3 | Response contains `Date` header | ✅ | `Sat, 13 Jun 2026 00:15:40 GMT` |
| 4 | Response contains expected cache headers | ✅ | `Cache-Control: no-cache, no-store, must-revalidate` |
| 5 | `index.html` is served | ✅ | `Content-Type: text/html`, non-empty body |
| 6 | Evidence is persisted | ✅ | This file and `RUNTIME_NAVIGATION.md` are complete |
| 7 | State is updated | ✅ | `STATE.json` updated with `worker_status: complete` |
