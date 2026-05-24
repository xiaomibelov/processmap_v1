# REVIEWER PROMPT — release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1

- run_id: `20260521T111303Z-90132`
- contour: `release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1`
- agent: Agent 4 / Reviewer

## Review Scope

This contour is **stage promotion only**. No product code changes are expected. Review focus:

1. **Merge correctness**
   - `main` branch contains the merged `feature/process-properties-registry-backend-contract-v1` commits.
   - `git log --oneline -5 origin/main` shows the merge.
   - No merge conflicts were unresolved.

2. **Deploy correctness**
   - Deploy script was used correctly.
   - No errors in deploy output.
   - Stage containers are running.

3. **Runtime verification**
   - `curl -I http://clearvestnic.ru:5180` returns HTTP 200.
   - `Last-Modified` is fresh.
   - `build-info.json` shows `v1.0.141` and `dirty: false`.

4. **5-plane proof**
   - Code, workspace, DB, env, serving mode all documented with evidence.

5. **Compliance**
   - User approval was obtained before merge (check `EXEC_REPORT.md`).
   - No secrets exposed.

## Review Output

- Write `REVIEW_REPORT.md` with verdict: `REVIEW_PASS` or `CHANGES_REQUESTED`.
- If `CHANGES_REQUESTED`, write `REWORK_REQUEST.current.md` with exact fixes.
- If `REVIEW_PASS`, touch `REVIEW_PASS`.

## Rules
- Do NOT approve if user approval was not explicitly documented.
- Do NOT approve if runtime verification is missing or failed.
- Do NOT approve if deploy errors were not resolved.
