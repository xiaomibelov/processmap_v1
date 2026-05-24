# Agent 4 / Reviewer Prompt — Local Launcher 4-Agent Apply & Smoke Review

## Identity
You are Agent 4 / Reviewer for ProcessMap.

## Language Rule
- This prompt is in English.
- All generated documentation, reports, and user-facing summaries must be written in **Russian**.
- Preserve exact Russian UI labels when referencing ProcessMap UI.

## Working Directory
`/opt/processmap-test`

## Contour ID
`tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1`

## Scope
Review the outputs of both Worker 2 and Worker 3 for the local launcher apply & smoke contour.

## Mandatory: Wait for Both Workers
Before starting any review, verify that BOTH of these exist:
1. `.planning/contours/tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1/WORKER_2_DONE`
2. `.planning/contours/tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1/WORKER_3_DONE`

If either is missing:
- Create `REVIEW_BLOCKED.md` with exact reason.
- Do NOT proceed with review.
- Exit.

## Mandatory: GSD Discipline
Run before any verdict:
```bash
cd /opt/processmap-test
echo "PATH=$PATH"
command -v gsd || true
test -x /opt/processmap-test/bin/gsd && echo "GSD_OK" || echo "GSD_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "TOOLS_OK" || echo "TOOLS_MISSING"
find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*' 2>/dev/null | wc -l
```

Record results in REVIEW_REPORT.md under section **"Reviewer GSD Discipline"**.

## Mandatory: RAG Preflight
Run:
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1" \
  --query "review rules local launcher 4-agent same CID dry-run no product runtime" \
  --format md \
  --top-k 10
```
Save to:
`.planning/contours/tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1/RAG_PREFLIGHT_REVIEWER_4.md`

Include RAG findings in REVIEW_REPORT.md.

## Mandatory: Read Worker Reports
Read ALL of the following:
1. `WORKER_2_REPORT.md`
2. `WORKER_3_REPORT.md`
3. `LOCAL_LAUNCHER_AUDIT.md`
4. `LOCAL_LAUNCHER_FIXES_APPLIED.md` or `LOCAL_LAUNCHER_NO_FIX_REQUIRED.md`
5. `LOCAL_CID_PROPAGATION_4_AGENT.md`
6. `LOCAL_DRY_RUN_RESULTS.md`
7. `LOCAL_VALIDATION_RESULTS.md`
8. `SERVER_4_AGENT_COMPATIBILITY_AUDIT.md`
9. `SERVER_SCRIPT_NAME_CONTRACT.md`
10. `SERVER_STATUS_VALIDATION.md`
11. `SERVER_MARKER_MODEL_VALIDATION.md`
12. `SERVER_FIXES_APPLIED.md` or `SERVER_NO_FIX_REQUIRED.md`
13. `SERVER_VALIDATION_RESULTS.md`

If any expected report is missing, note it in REVIEW_REPORT.md.

## Mandatory: Independent Validation
Do NOT trust worker reports alone. Independently verify:

### A. Local Scripts (if accessible)
If local Mac files are accessible:
```bash
bash -n "$HOME/Desktop/ProcessMap Agents.command" 2>/dev/null || true
bash -n "$HOME/bin/processmap-iterm-agents.sh" 2>/dev/null || true
bash -n "$HOME/bin/processmap-iterm-agents-3windows.sh" 2>/dev/null || true
bash -n "$HOME/bin/processmap-agent-pane.sh" 2>/dev/null || true
```
If NOT accessible, document this and check if the limitation is explicitly stated in worker reports.

### B. Server Scripts
```bash
cd /opt/processmap-test
bash -n tools/pm-agent1-planner.sh
bash -n tools/pm-agent2-executor-watch.sh
bash -n tools/pm-agent3-reviewer-watch.sh
bash -n tools/pm-agent4-reviewer-watch.sh
bash -n tools/pm-agent-status.sh
bash -n tools/pm-agent-reset-stale.sh
bash -n tools/pm-agents-server-tmux.sh
```

### C. Status Script Output
```bash
./tools/pm-agent-status.sh "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1" || true
```
Verify it shows:
- Agent 1 (Planner) status
- Worker 2 status
- Worker 3 status
- Agent 4 (Reviewer) status

### D. CID Propagation
Verify that the same CID is passed to all 4 agents:
- Check local launcher dry-run output (if available).
- Check server script argument passing.
- Look for any place where CID could be silently replaced with default/stale value.
- Verify regex `^[A-Za-z0-9_./-]+$` is used consistently.

### E. Dry-Run Verification
Verify dry-run proves 4-agent command construction:
- 4 commands printed.
- Same CID in all 4.
- No iTerm/tmux/kimi launched in dry-run mode.
- If local dry-run not available, check that worker reports explicitly document expected output.

### F. Agent 4 Reviewer Command
Verify:
- `pm-agent4-reviewer-watch.sh` exists.
- It waits for `WORKER_2_DONE` + `WORKER_3_DONE`.
- It reads both worker reports.
- It generates reviewer prompt in English.
- It runs `kimi` after prompt generation.

### G. Marker Model
Verify the contour directory contains the expected marker files:
- `READY_FOR_EXECUTION`
- `WORKER_2_DONE`
- `WORKER_3_DONE`
- And for this review: `REVIEW_STARTED`, then `REVIEW_PASS` or `CHANGES_REQUESTED`.

### H. No Product Runtime Changes
Run:
```bash
cd /opt/processmap-test
git diff --name-only
```
Verify NO changes in:
- `frontend/src/`
- `backend/app/`
- `.env`
- `package.json`, `requirements.txt`

Tooling changes in `tools/`, `.planning/`, `.agents/` are expected and allowed.

### I. No Secrets Printed
Review all worker reports and your own output. If any secrets, tokens, or credentials appear, flag as CRITICAL.

## Review Verdict Rules

### You MAY issue REVIEW_PASS only if ALL of the following are true:
1. Agent 1 planning pack exists (PLAN.md, WORKER_2_PROMPT.md, WORKER_3_PROMPT.md, REVIEWER_PROMPT.md, STATE.json).
2. WORKER_2_DONE exists.
3. WORKER_3_DONE exists.
4. Both worker reports exist and are readable.
5. Same CID propagation to Agent 1/2/3/4 is proven.
6. Split mode [1] supports 4 agents (or explicitly documented as limitation).
7. Fallback mode supports 4 agents or clearly documented equivalent.
8. Dry-run proves command construction for all 4 agents (or expected output is documented if local unavailable).
9. CID validation remains.
10. Invalid CID rejected.
11. Invalid mode rejected or re-prompted.
12. tmux kill remains opt-in.
13. Server scripts run from /opt/processmap-test.
14. Agent 4 reviewer script/path exists and passes `bash -n`.
15. `pm-agent-status.sh` shows 4-agent state.
16. RAG preflight compatibility is preserved.
17. No product runtime changes.
18. No frontend/backend app changes.
19. No package install.
20. No secrets printed.
21. Backups exist before edits (or edits were not needed).
22. Documentation/reports are in Russian.
23. Agent prompts are in English.
24. If local Mac was unavailable, limitation is explicitly documented and worker did NOT claim full local validation.

### You MUST issue CHANGES_REQUESTED if ANY of the following are true:
- Local launcher still only starts 3 agents.
- Agent 4 cannot be started from local launcher.
- Agent 3 is still treated as reviewer in local launcher (role mismatch).
- CID mismatch is possible.
- Dry-run does not show all 4 roles.
- Local files were unavailable and report pretends full local validation.
- Product runtime files changed.
- Secrets were printed.
- Server script name mismatch breaks local launcher.
- Agent 4 reviewer script missing or syntactically invalid.
- Status script does not show 4-agent state.

## Required Outputs

### REVIEW_REPORT.md (in Russian)
Must contain:
1. **Reviewer GSD Discipline** — commands run, results.
2. **RAG Preflight Summary** — findings.
3. **Worker 2 Review** — what was checked, verdict.
4. **Worker 3 Review** — what was checked, verdict.
5. **Independent Validation** — exact commands run, outputs.
6. **CID Propagation Verification** — proof.
7. **Dry-Run Verification** — proof or documented limitation.
8. **Agent 4 Reviewer Command Verification** — proof.
9. **Marker Model Verification** — list of markers found.
10. **Product Runtime Check** — git diff summary, confirmation of no product changes.
11. **Secrets Check** — PASS or FAIL.
12. **Final Verdict** — REVIEW_PASS or CHANGES_REQUESTED.
13. **Risks / Follow-up** — anything that needs future work.

### Verdict Marker
If PASS:
```
.planning/contours/tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1/REVIEW_PASS
```

If FAIL:
```
.planning/contours/tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1/CHANGES_REQUESTED
.planning/contours/tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1/REWORK_REQUEST.md
```

REWORK_REQUEST.md must list exact changes needed, which worker should fix them, and why.

### Mirror Report
After creating review artifacts, run:
```bash
./tools/pm-agent-mirror-report.sh "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1" reviewer
```

## Boundaries (HARD)
- NO product runtime changes.
- NO .env or secrets changes.
- NO package installation.
- NO commit/push/PR/deploy.
- NO GSD repair.
- NO MCP repair.
- If blocked, create REVIEW_BLOCKED.md, not a fake pass.
