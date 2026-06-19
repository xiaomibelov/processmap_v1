# Runtime Navigation — audit/analytic_01

## Local Dev Server

- URL: `http://localhost:5177`
- Backend: `http://localhost:8088`

If dev server is not running, the audit may proceed as static-only. Report this in `AUDIT_REPORT.md`.

## Direct Analytics Surface URLs

Use a known workspace/project/session or the stage example values below if local seed data matches:

```text
http://localhost:5177/app?workspace=ws_8b89c83ea810_main&project=e41791f9f7&session=1a5bd431d8&surface=analytics
http://localhost:5177/app?workspace=ws_8b89c83ea810_main&project=e41791f9f7&session=1a5bd431d8&surface=product-actions-registry
http://localhost:5177/app?workspace=ws_8b89c83ea810_main&project=e41791f9f7&session=1a5bd431d8&surface=process-properties-registry
http://localhost:5177/app?workspace=ws_8b89c83ea810_main&project=e41791f9f7&session=1a5bd431d8&surface=dashboards
```

Replace IDs with locally valid values if the example IDs do not exist.

## Organization

If prompted, select `Роботизация производств` or the locally configured organization.

## Navigation Steps

1. Open direct session URL (or local equivalent).
2. Verify the `Аналитика` / analytics header button is active/highlighted when `surface=analytics`.
3. Click the analytics button and verify URL changes to `surface=analytics`.
4. Click browser Back and verify:
   - URL returns to previous surface.
   - Header active state updates.
5. Repeat for `product-actions-registry` and `process-properties-registry` if entrypoints are reachable.

## Browser Console

Open DevTools Console before navigation. Record:
- `console.error` count.
- Any React key warnings or prop-type warnings.

## Credentials / Storage State

If local dev server requires login, use:

```bash
node tools/stage-auth-save-storage-state.mjs
```

Or authenticate manually and save Playwright storage state to `.local/processmap/playwright/`.

## Stage Fallback (read-only)

If local dev server is unavailable, stage can be used for read-only observation:

```text
https://stage.processmap.ru/app?workspace=ws_8b89c83ea810_main&project=e41791f9f7&session=1a5bd431d8&surface=analytics
```

Do not mutate data on stage during an audit.
