# Runtime Proof Checklist: stage8/test-devserver-1781309075

## Required Evidence

- [x] Source truth captured (`git branch --show-current`, `git rev-parse HEAD`, `git status -sb`).
- [x] `curl -I --max-time 5 http://localhost:5177/` executed and output recorded.
- [x] If reachable: HTTP status line shows `200 OK`.
- [x] If reachable: `Date` header recorded verbatim.
- [x] If reachable: `Server` header recorded.
- [x] If reachable: `Content-Type: text/html` present.
- [x] If reachable: `Content-Length` recorded.
- [x] If reachable: Anti-cache headers present (`Cache-Control: no-cache, no-store, must-revalidate` or equivalent).
- [x] `curl -sf --max-time 5 http://localhost:5177/` executed and non-empty HTML body confirmed.
- [x] `EXEC_REPORT.md` written.
- [x] `STATE.json` updated.

## Fallback Evidence

- [ ] If `curl` unavailable: `wget -S -O /dev/null http://localhost:5177/` executed and output recorded.
  - Not applicable: `curl` was available and used successfully.

## Not Applicable

- Browser screenshots, session URLs, Playwright traces, and backend API functional tests are not applicable for this dev-server smoke-test contour.

## Header Evidence

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

## Body Evidence

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
