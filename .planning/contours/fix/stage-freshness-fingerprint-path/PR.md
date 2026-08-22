# PR: stage-freshness-fingerprint-path

## Original PR

- **Title:** [fix] Перенос fingerprint-файла stage-деплоя в /tmp для стабильности verify-chain
- **URL:** https://github.com/xiaomibelov/processmap_v1/pull/396
- **Branch:** `fix/stage-freshness-fingerprint-path`
- **Base:** `main`
- **Status:** `merged` (closed)
- **Head commits at merge:**
  - `eec051ce` — move fingerprint file out of `frontend/` to `/tmp/`

## Current / Follow-up PR

- **Title:** [fix] Перенос fingerprint-файла stage-деплоя в /tmp для стабильности verify-chain
- **URL:** https://github.com/xiaomibelov/processmap_v1/pull/398
- **Branch:** `fix/stage-freshness-fingerprint-path`
- **Base:** `main`
- **Status:** `open` — awaiting review
- **Head commits:**
  - `eec051ce` — move fingerprint file out of `frontend/` to `/tmp/`
  - `13289588` — pass deploy fingerprint to gateway build via env vars

## Description

Fixes stage deployment `verify-chain` failures caused by the fingerprint file being erased from `frontend/`, and ensures the gateway image build still receives the fingerprint after the file is moved to `/tmp/`.

## Acceptance criteria

- [x] Fingerprint file path is outside the git-working tree.
- [x] Workflows export `STAGE_FRESHNESS_SOURCE_FILE` consistently.
- [x] Cleanup happens only after successful `verify-chain`.
- [x] Gateway build receives `VITE_DEPLOY_FINGERPRINT` via env/args.
- [x] Built bundle contains the deploy fingerprint and banner.
- [x] Manual `prepare-source` → `verify-chain` run passes.
- [x] Local frontend build with env fingerprint includes fingerprint in output.
- [x] PR created and opened for review.
- [ ] PR reviewed and approved.
- [ ] Merged to `main`.
