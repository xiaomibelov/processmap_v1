# Runtime Proof Checklist — stage8/test-devserver-1781309007

## Source Truth
| Item | Value |
|------|-------|
| git branch | test/agent-max-total-time |
| git HEAD | 48f2950b8e2049797489f83c96b4af05b4323b1a |
| git status | ## test/agent-max-total-time...origin/main [ahead 1] ; untracked: .planning/contours/stage1/ ... stage8/ .worktrees/ |

## Dev Server Probe
| Item | Value |
|------|-------|
| URL | `http://localhost:5177/` |
| Tool used | `curl` |
| Status line | `HTTP/1.1 200 OK` |
| Date header | `Sat, 13 Jun 2026 00:06:20 GMT` |
| Server header | `nginx/1.27.5` |
| Content-Type | `text/html` |
| Content-Length | `439` |
| Cache-Control | `no-cache, no-store, must-revalidate` (plus `Pragma: no-cache`, `Expires: 0`) |
| Body snippet | `<!doctype html><html lang="ru"><head><meta charset="UTF-8" />...<div id="root"></div></body></html>` |

## Acceptance Criteria
| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | Source/runtime truth captured | PASS | Source Truth table above |
| 2 | Dev server is reachable | PASS | `HTTP/1.1 200 OK` |
| 3 | Response contains `Date` header | PASS | `Sat, 13 Jun 2026 00:06:20 GMT` |
| 4 | Response contains expected cache headers | PASS | `Cache-Control: no-cache, no-store, must-revalidate` |
| 5 | `index.html` is served | PASS | `Content-Type: text/html`, body length 439 bytes |
| 6 | Evidence is persisted | PASS | This file and `RUNTIME_NAVIGATION.md` are complete |
| 7 | State is updated | PASS | `STATE.json` worker_status set to `complete` |

## Notes / Waivers
- Server `Date` header (`00:06:20 GMT`) is within seconds of probe time (`00:06:24 GMT`), so the response is fresh.
- The server is nginx/1.27.5 (reverse-proxy), serving the current Vite/React `index.html` with anti-cache headers.
- No product code changes were made; this is a validation-only contour.
