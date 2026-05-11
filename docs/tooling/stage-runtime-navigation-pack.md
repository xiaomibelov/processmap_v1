# Stage Runtime Navigation Pack

This repo-local pack lets ProcessMap agents open a known stage session without rediscovering login, organization, workspace, project, session, tabs, or common runtime surfaces.

## Files

- `.local/processmap/stage.env.example` documents required local stage values.
- `.local/processmap/stage-runtime-navigation.md.example` documents direct navigation and UI landmarks.
- `tools/stage-auth-save-storage-state.mjs` creates local Playwright storage state.
- `tools/stage-open-session-proof.mjs` opens the direct session URL and prints compact proof JSON.

## Secret Handling

Real local files are intentionally ignored:

- `.local/processmap/stage.env`
- `.local/processmap/playwright/*.json`
- `.auth/`
- `*.storage-state.json`

Scripts never print `PROCESSMAP_STAGE_PASSWORD`.

## Agent Rule

Executor and Reviewer agents should use this pack before exploring the app shell. Explorer/workspace navigation is only required when the contour explicitly asks for it or when direct session proof fails.

## Commands

Save storage state:

```bash
node tools/stage-auth-save-storage-state.mjs
```

Open proof from the direct stage session URL:

```bash
node tools/stage-open-session-proof.mjs analysis
node tools/stage-open-session-proof.mjs diagram
node tools/stage-open-session-proof.mjs xml
node tools/stage-open-session-proof.mjs doc
node tools/stage-open-session-proof.mjs dod
```

The proof JSON includes `loaded`, `url`, `hasErrorBoundary`, `activeTabMarkers`, `tabProof`, `consoleErrorCount`, and `consoleErrorsBrief`.
