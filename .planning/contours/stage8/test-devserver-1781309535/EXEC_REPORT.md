# Execution Report: stage8/test-devserver-1781309535

## Source Truth at Execution Time

| Command | Output |
|---------|--------|
| `pwd` | `/opt/processmap-test` |
| `git remote -v` | `origin\tgit@github.com:xiaomibelov/processmap_v1.git (fetch)` |
| `git branch --show-current` | `test/agent-max-total-time` |
| `git rev-parse HEAD` | `48f2950b8e2049797489f83c96b4af05b4323b1a` |
| `git rev-parse origin/main` | `e1143c14f901882c12dc550f71bfd6757d60b882` |
| `git merge-base HEAD origin/main` | `e1143c14f901882c12dc550f71bfd6757d60b882` |
| `git status -sb` | `## test/agent-max-total-time...origin/main [ahead 1]` |
| `git diff --name-only` | (empty) |
| `git diff --cached --name-only` | (empty) |

## Commands Run

### 1. Header probe

```bash
curl -I --max-time 5 http://localhost:5177/ 2>&1
```

Output:

```
HTTP/1.1 200 OK
Server: nginx/1.27.5
Date: Sat, 13 Jun 2026 00:15:40 GMT
Content-Type: text/html
Content-Length: 439
Last-Modified: Sat, 13 Jun 2026 00:09:21 GMT
Connection: keep-alive
ETag: "6a2c9fb1-1b7"
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
Accept-Ranges: bytes
```

### 2. Body probe

```bash
curl -sf --max-time 5 http://localhost:5177/ 2>&1 | head -c 2000
```

Output:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.ico" />
    <title>ProcessMap</title>
    <script type="module" crossorigin src="/assets/index-DFtG4nC5.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-CZsTRQYy.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

## Header/Body Evidence

- **HTTP status line:** `HTTP/1.1 200 OK`
- **Server:** `nginx/1.27.5`
- **Date:** `Sat, 13 Jun 2026 00:15:40 GMT` (fresh)
- **Content-Type:** `text/html`
- **Content-Length:** `439`
- **Cache-Control:** `no-cache, no-store, must-revalidate`
- **Pragma:** `no-cache`
- **Expires:** `0`
- **Body:** Non-empty HTML (`index.html`) starting with `<!doctype html>`

## Runtime Proof Status

- `RUNTIME_PROOF_CHECKLIST.md`: ✅ complete
- `RUNTIME_NAVIGATION.md`: ✅ complete
- Dev server reachable on `http://localhost:5177/`: ✅ yes
- Expected no-cache headers present: ✅ yes
- `index.html` served with non-empty body: ✅ yes

## Explicit Unchanged Areas

- No product frontend/backend code was modified.
- No `.gitignore`, git config, hooks, or branch metadata changes.
- No deletion or staging of unrelated untracked files.
- No merge, rebase, cherry-pick, push, PR, deploy, or release actions.
- No DB/schema, BPMN XML, AI/RAG, Product Actions, export, or deploy work.
- The dev server was not started, restarted, or reconfigured.

## Remaining Risks / Environment Notes

- The response `Server` header is `nginx/1.27.5`, indicating the probe traversed the nginx reverse-proxy rather than hitting the Vite dev server directly. This is acceptable for the smoke test but should be noted if future contours need to validate Vite-specific behavior.
- The `Last-Modified` header (`Sat, 13 Jun 2026 00:09:21 GMT`) is older than the `Date` header, which is expected for a static `index.html` served by nginx.
- No further runtime validation of the bundled JS/CSS assets was performed; this contour scoped only to the root `/` endpoint.
