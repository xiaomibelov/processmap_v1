# Runtime Serve Proof

- contour: `release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1`
- run_id: `20260521T111303Z-90132`
- verified_at: `2026-05-21T11:49:46Z`
- branch: `main`
- HEAD: `5affb5ff0abce2735df1c34fe369a39fe9c354e3`
- stage URL: `http://clearvestnic.ru:5180`

## HTTP headers

```
HTTP/1.1 200 OK
Server: nginx/1.27.5
Date: Thu, 21 May 2026 11:49:46 GMT
Content-Type: text/html
Content-Length: 439
Last-Modified: Thu, 21 May 2026 11:47:31 GMT
Connection: keep-alive
ETag: "6a0ef0d3-1b7"
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
Accept-Ranges: bytes
```

## build-info.json

```json
{
  "branch": "main",
  "sha": "5affb5ff0abce2735df1c34fe369a39fe9c354e3",
  "shaShort": "5affb5f",
  "timestamp": "2026-05-21T11:46:55.194Z",
  "contourId": "release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1",
  "dirty": false,
  "host": "clearvestnic.ru"
}
```

## API health

```json
{"ok":true,"status":"ok","redis":{"mode":"ON","state":"healthy","configured":true,"required":true,"available":true,"degraded":false,"incident":false,"fallback_active":false,"reason":"","redis_url":"redis://redis:6379/0","client_error":"","ping_error":""},"api":"ready"}
```

## Docker serving

- gateway: `processmap-stage-gateway-5180` on port `5180`
- api: `processmap_test-api-1` on network `processmap_test_default`
- redis/postgres: healthy in `processmap_test`
