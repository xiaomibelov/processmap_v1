# tooling/processmap-agent-console-standalone-v1

Status: implemented as a standalone runtime contour.

## Boundary

This contour must not be imported into the ProcessMap product app.

Allowed integration:

- read `.agents/run-state`;
- read `.planning/contours`;
- generate local launcher commands;
- store console-only settings under `/opt/processmap-agent-console/settings.json`.

Forbidden integration:

- no FastAPI router import into `backend/app/routers`;
- no React admin route under `frontend/src/features/admin`;
- no ProcessMap product navigation item;
- no product DB writes;
- no arbitrary shell command execution from browser.

## Runtime

Runtime path:

```text
/opt/processmap-agent-console
```

Default URL through SSH tunnel:

```text
http://127.0.0.1:5191
```

## Verification

- Product route imports restored.
- Product frontend rebuild required after restoration.
- Standalone console validates with `node --check`.
