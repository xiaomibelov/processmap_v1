# Execution report

- Removed the upper-level timeout race that allowed manual save to start a second flush while autosave was active.
- Preserved the latest canvas revision when changes arrive during an active save, causing one queued replay.
- Added exact authoritative-XML reconciliation for a prior request that committed after the client timed out.
- Restricted the hard conflict gate to the `DIAGRAM_STATE_CONFLICT` code; unrelated HTTP 409 responses no longer pause all diagram saves.
- Selected the newest known CAS base across tracker and persistence payload.

Verification:

- Save regression suite: 71/71 passed with `--test-concurrency=1`.
- Persistence suite: 15/15 passed.
- Vite production build: passed.
- `git diff --check`: passed.
- `graphify update .`: passed with existing parser/size warnings.
