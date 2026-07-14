# PR: stage-freshness-fingerprint-build

- **Title:** [fix] Передача deploy fingerprint в gateway build через env vars
- **URL:** https://github.com/xiaomibelov/processmap_v1/pull/397
- **Branch:** `fix/stage-freshness-fingerprint-build`
- **Base:** `main`
- **Status:** `open` — awaiting review
- **Head commit:** `ccb487e1`

## Description

Follow-up to #396. Ensures the deploy fingerprint is embedded into the gateway JS bundle after the fingerprint file was moved to `/tmp/`.

## Acceptance criteria

- [x] Gateway build receives `VITE_DEPLOY_FINGERPRINT` via env/args.
- [x] Vite prefers env vars and falls back to JSON file.
- [x] Built bundle contains the deploy fingerprint and banner.
- [x] Local build verification passed.
- [ ] PR reviewed and approved.
- [ ] Merged to `main`.
