## Source / Runtime Truth

### Environment
- pwd: /opt/processmap-test
- whoami: root
- hostname: clearvestnic.ru
- date: 2026-05-16T20:06:49+00:00

### Git
- branch: fix/lockfile-sync-test
- HEAD: a9a9d9c5f468d9da63415306da6d34dcd605aa0d
- origin/main: d805e1c64c1107b9e3fe6854e031694bf741b187
- diff names: 8 files
- diff stat:
 frontend/src/components/AppShell.jsx               |  5 +--
 frontend/src/components/ProcessStage.jsx           |  5 +--
 frontend/src/config/appVersion.js                  | 37 +++++++++++++++++++++-
 .../stage/controllers/useBpmnViewportSource.js     |  2 +-
 .../process/stage/hooks/useBpmnCanvasController.js |  2 +-
 .../stage/ui/ProcessStageDiagramControls.jsx       |  5 +--
 frontend/src/main.jsx                              |  5 +++
 frontend/vite.config.js                            |  3 ++
 8 files changed, 55 insertions(+), 9 deletions(-)

### Runtime
- health 8088:
{"ok":true,"status":"ok","redis":{"mode":"ON","state":"healthy","configured":true,"required":true,"available":true,"degraded":false,"incident":false,"fallback_active":false,"reason":"","redis_url":"redis://redis:6379/0","client_error":"","ping_error":""}}
- head 5180:
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0  0   439    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
HTTP/1.1 200 OK
Server: nginx/1.27.5
Date: Sat, 16 May 2026 20:06:49 GMT
Content-Type: text/html
Content-Length: 439
Last-Modified: Sat, 16 May 2026 14:01:13 GMT
Connection: keep-alive
ETag: "6a0878a9-1b7"
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
Accept-Ranges: bytes


- docker ps:
NAMES                                    STATUS                  PORTS
processmap_test-gateway-1                Up 12 hours             0.0.0.0:5180->80/tcp, [::]:5180->80/tcp
processmap-test-postgres-1               Up 24 hours (healthy)   
processmap-test-redis-1                  Up 24 hours (healthy)   
processmap_test-frontend-1               Up 26 hours             5177/tcp
processmap_test-api-1                    Up 2 days               0.0.0.0:8088->8000/tcp, [::]:8088->8000/tcp
processmap_test-postgres-1               Up 2 days (healthy)     0.0.0.0:5433->5432/tcp, [::]:5433->5432/tcp
processmap_test-redis-1                  Up 2 days (healthy)     0.0.0.0:6380->6379/tcp, [::]:6380->6379/tcp
bpmn123-backend-local                    Up 6 days (healthy)     0.0.0.0:8087->8000/tcp, [::]:8087->8000/tcp
bpmn123-frontend-local                   Up 6 days (healthy)     5177/tcp, 0.0.0.0:5178->5178/tcp, [::]:5178->5178/tcp
processmap_v1_overlay_audit-api-1        Up 6 days               0.0.0.0:8011->8000/tcp, [::]:8011->8000/tcp
processmap_v1_overlay_audit-postgres-1   Up 6 days (healthy)     0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
processmap_v1_overlay_audit-redis-1      Up 6 days (healthy)     0.0.0.0:6379->6379/tcp, [::]:6379->6379/tcp

- build-info.json:
{
  "branch": "fix/lockfile-sync-test",
  "sha": "a9a9d9c5f468d9da63415306da6d34dcd605aa0d",
  "shaShort": "a9a9d9c",
  "timestamp": "2026-05-16T13:32:59.873Z",
  "contourId": "perf/process-stage-baseline-jank-v1",
  "dirty": true,
  "host": "clearvestnic.ru"
}

- JS asset hash from HTML:
src="/assets/index-CrJUzrye.js"
