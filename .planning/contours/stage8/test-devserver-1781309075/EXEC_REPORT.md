# Execution Report: stage8/test-devserver-1781309075

## Source Truth at Execution Time

| Item | Value |
|------|-------|
| `pwd` | `/opt/processmap-test` |
| `git remote -v` | `origin git@github.com:xiaomibelov/processmap_v1.git (fetch)` |
| `git branch --show-current` | `test/agent-max-total-time` |
| `git rev-parse HEAD` | `48f2950b8e2049797489f83c96b4af05b4323b1a` |
| `git rev-parse origin/main` | `e1143c14f901882c12dc550f71bfd6757d60b882` |
| `git merge-base HEAD origin/main` | `e1143c14f901882c12dc550f71bfd6757d60b882` |
| `git status -sb` | `## test/agent-max-total-time...origin/main [ahead 1]` plus pre-existing untracked `.planning/contours/stage1/` through `.planning/contours/stage8/` and `.worktrees/` |
| `git diff --name-only` | (empty) |
| `git diff --cached --name-only` | (empty) |

## Commands Run

### 1. HEAD probe

```bash
curl -I --max-time 5 http://localhost:5177/
```

### 2. GET body probe

```bash
curl -sf --max-time 5 http://localhost:5177/ | head -c 2000
```

## Full Command Output

### HEAD probe output

```
HTTP/1.1 200 OK
Server: nginx/1.27.5
Date: Sat, 13 Jun 2026 00:07:04 GMT
Content-Type: text/html
Content-Length: 439
Last-Modified: Fri, 12 Jun 2026 23:04:14 GMT
Connection: keep-alive
ETag: "6a2c906e-1b7"
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
Accept-Ranges: bytes
```

### GET body output

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.ico" />
    <title>ProcessMap</title>
    <script type="module" crossorigin src="/assets/index-CrZqAVDF.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-CZsTRQYy.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

## Header Evidence

| Header | Value |
|--------|-------|
| Status line | `HTTP/1.1 200 OK` |
| `Server` | `nginx/1.27.5` |
| `Date` | `Sat, 13 Jun 2026 00:07:04 GMT` |
| `Content-Type` | `text/html` |
| `Content-Length` | `439` |
| `Cache-Control` | `no-cache, no-store, must-revalidate` |
| `Pragma` | `no-cache` |
| `Expires` | `0` |

## Body Evidence

- Non-empty HTML body returned.
- Contains `<!doctype html>`, `<title>ProcessMap</title>`, and `<div id="root"></div>`.
- References frontend assets `/assets/index-CrZqAVDF.js` and `/assets/index-CZsTRQYy.css`.

## Runtime Proof Status

- Dev server reachable: **YES**
- HTTP status: **200 OK**
- `index.html` served: **YES**
- Expected anti-cache headers present: **YES**
- Tool used: `curl` (no fallback needed)

## Explicit Unchanged Areas

- No product frontend/backend code modified.
- No `.gitignore`, git config, hooks, or branch metadata changed.
- No unrelated untracked files deleted or staged.
- No merge, rebase, cherry-pick, push, PR, deploy, or release performed.
- No DB/schema, BPMN XML, AI/RAG, Product Actions, export, or deploy work performed.
- Server was not started, restarted, or reconfigured.

## Remaining Risks / Environment Notes

- The response is served by `nginx/1.27.5` rather than a Vite dev server directly. This is consistent with the reverse-proxy configuration in `deploy/nginx/default.conf`.
- `Last-Modified` header (`Fri, 12 Jun 2026 23:04:14 GMT`) predates the probe `Date` header, which is expected for a static file; the response itself is fresh (Date `00:07:04 GMT`).
- If the dev server process stops, this contour would need to be re-run to re-verify reachability.
- Branch `test/agent-max-total-time` is one commit ahead of `origin/main`; this does not affect the dev-server smoke test because no product code changes were made in this contour.
