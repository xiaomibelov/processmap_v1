# Runtime Navigation: stage8/test-devserver-1781309535

## Endpoint Under Test

- **URL:** `http://localhost:5177/`
- **Methods:** `HEAD` (header probe), then `GET` (body probe)
- **Expected response:** HTTP 200 with `Content-Type: text/html` and a non-empty `index.html` body

## Probe Results

- **Tool used:** `curl`
- **Status:** `HTTP/1.1 200 OK`
- **Server:** `nginx/1.27.5`
- **Date:** `Sat, 13 Jun 2026 00:15:40 GMT`
- **Content-Type:** `text/html`
- **Content-Length:** `439`
- **Cache-Control:** `no-cache, no-store, must-revalidate`
- **Pragma:** `no-cache`
- **Expires:** `0`
- **Body first line:** `<!doctype html>`

## Prerequisites

- No login or setup steps required for this smoke test.
- The dev server is expected to be reachable on `localhost:5177`.

## Tooling

- Primary: `curl`
- Fallback: `wget -S -O /dev/null` (not needed; `curl` succeeded)

## Notes

- `/app` in the test container maps to `/opt/processmap-test/frontend` on the host.
- The `Server` header returned was `nginx/1.27.5`, indicating the response was served through the nginx reverse-proxy rather than directly by the Vite dev server.
- The `Date` header was fresh at the time of the probe (within seconds of execution time).
