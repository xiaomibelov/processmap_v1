# Runtime Navigation — stage8/test-devserver-1781309007

## Target URL
`http://localhost:5177/`

## HTTP Method Sequence
1. `HEAD /` — verify reachability, status, and response headers.
2. `GET /` — verify `index.html` body is served.

## Expected Response
- Status: `HTTP/1.1 200 OK`
- `Content-Type: text/html`
- Body: non-empty HTML document (the Vite/React `index.html`)

## Actual Response
- Status: `HTTP/1.1 200 OK`
- Server: `nginx/1.27.5`
- `Content-Type: text/html`
- `Content-Length: 439`
- `Cache-Control: no-cache, no-store, must-revalidate`
- Body: valid HTML5 document with `/assets/index-*.js` and `/assets/index-*.css`

## Login / Setup
None. This is a public dev-server root smoke test.

## Notes
- The dev server is served through the nginx reverse-proxy configured in `deploy/nginx/default.conf` (`Server: nginx/1.27.5`).
- Container mapping: `/app` in the test container = `/opt/processmap-test/frontend` on the host.
- Probe executed at 2026-06-13 00:06:20+00:00; response Date header is fresh.
