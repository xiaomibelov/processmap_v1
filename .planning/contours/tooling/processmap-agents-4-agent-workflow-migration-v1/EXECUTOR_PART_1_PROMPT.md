# Agent 2 / Worker Prompt — Local Mac Launcher Migration

## Identity
You are Agent 2 / Worker for ProcessMap.

## Language Rule
- This prompt is in English.
- All generated documentation, reports, and user-facing summaries must be written in **Russian**.
- Preserve exact Russian UI labels when referencing ProcessMap UI.

## Working Directory
Server: `/opt/processmap-test` (for reports and contour artifacts)
Local Mac: your own `~` (for launcher inspection and fixes)

## Contour ID
`tooling/processmap-agents-4-agent-workflow-migration-v1`

## Scope — Work Package A
Migrate or extend the **local Mac launcher** to support the new 4-agent workflow.

Old: Agent 1 → Agent 2 → Agent 3
New: Agent 1 → Agent 2 + Agent 3 → Agent 4

## Mandatory: RAG Preflight
Before any work, run:
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --contour "tooling/processmap-agents-4-agent-workflow-migration-v1" \
  --area "local Mac launcher 4-agent migration split mode 3-window CID validation dry-run" \
  --format md \
  --top-k 10
```
Save output to:
`.planning/contours/tooling/processmap-agents-4-agent-workflow-migration-v1/RAG_PREFLIGHT_WORKER_2.md`

## Mandatory: Source Truth
Capture local source truth:
```bash
pwd
whoami
hostname
date -Is
ls -la "$HOME/Desktop" | grep -i "ProcessMap" || true
ls -la "$HOME/bin" | grep -E "processmap|agent|iterm" || true
```

## Files to Inspect
1. `~/Desktop/ProcessMap Agents.command`
2. `~/bin/processmap-iterm-agents.sh`
3. `~/bin/processmap-iterm-agents-3windows.sh`
4. `~/bin/processmap-agent-pane.sh`

For each file:
- Read the first 420 lines.
- Run `bash -n` to validate syntax.
- Document current behavior.
- Identify what needs to change for 4-agent support.

## Backup Rule
Before editing any local file, create a backup:
```bash
cp "$file" "$file.bak.$(date +%Y%m%d_%H%M%S)"
```
If you cannot edit local files (e.g., you are on a server), document this and create `LOCAL_LAUNCHER_NO_FIX_REQUIRED.md` with a detailed checklist of what **should** change.

## Required Changes

### 1. Support 4 Agents in Split Mode [1]
If `processmap-iterm-agents.sh` uses iTerm split panes:
- Add a 4th pane for Agent 4 / Reviewer.
- Label it clearly: `A4-reviewer`.
- Preserve existing split layout logic.

### 2. Support 4 Agents in 3-Window Mode [2]
If `processmap-iterm-agents-3windows.sh` uses multiple iTerm windows:
- Either add a 4th window, OR
- Rename the mode explicitly to 4-window and update documentation, OR
- Add Agent 4 into one of the existing windows (e.g., split a window into two panes).

The key requirement: **Agent 4 must have a dedicated visible context**.

### 3. CID Validation Preserved
Ensure the same CID validation rules are applied:
- Allowed: `A-Z a-z 0-9 _ - / .`
- Reject invalid CIDs with error message.
- Pass the exact same CID to all 4 agent launch commands.

### 4. Dry-Run Preserved
If `PROCESSMAP_AGENTS_DRY_RUN=1` is set:
- Print the constructed commands instead of executing them.
- Prove that the same CID appears in all 4 agent command lines.
- Do not launch `kimi` or `tmux` in dry-run mode.

### 5. tmux Kill Remains Opt-In
If there is a tmux kill step:
- It must remain opt-in (e.g., require explicit flag or confirmation).
- Do not make it automatic or default.

### 6. `processmap-agent-pane.sh` Compatibility
If this helper exists:
- Update it to know about 4 agents.
- Or document that it is deprecated and replace with inline logic.

## Required Reports (in Russian)
Create these files in the contour directory on the server:

1. **WORKER_2_REPORT.md**
   - Summary of work done.
   - Files inspected.
   - Changes made (or not made, with reason).
   - Validation results.
   - Blockers (if any).

2. **LOCAL_LAUNCHER_4_AGENT_AUDIT.md**
   - Current state of each local file.
   - What supports 4 agents already.
   - What needs changing.
   - Recommended changes.

3. **LOCAL_LAUNCHER_FIXES_APPLIED.md**
   - If changes were made: list each file, backup location, diff summary.
   - Or **LOCAL_LAUNCHER_NO_FIX_REQUIRED.md** if no changes needed or impossible due to environment.

4. **CID_PROPAGATION_4_AGENT_LOCAL.md**
   - Proof that the same CID reaches Agent 1, Agent 2, Agent 3, and Agent 4.
   - Show command construction or dry-run output.

5. **LOCAL_DRY_RUN_RESULTS.md**
   - Output of dry-run if available.
   - Show 4 agent commands.
   - Show CID in each command.

6. **LOCAL_VALIDATION_RESULTS.md**
   - `bash -n` results for each script.
   - Mode selection tests.
   - Invalid CID rejection test.
   - Invalid mode rejection test.

## Final Marker
After all work and reports are complete, create:
```
.planning/contours/tooling/processmap-agents-4-agent-workflow-migration-v1/WORKER_2_DONE
```

Contents:
```
WORKER_2_DONE
contour=tooling/processmap-agents-4-agent-workflow-migration-v1
run_id=20260517T000255Z-41876
completed_at=<ISO8601>
```

## Boundaries (HARD)
- NO product runtime changes (frontend/src/, backend/app/).
- NO .env or secrets changes.
- NO package installation.
- NO commit/push/PR/deploy.
- NO GSD repair.
- NO MCP repair.
- If local files are inaccessible, document and do not fake results.

## Handoff
After WORKER_2_DONE is created, Agent 3 / Worker will run in parallel. Agent 4 / Reviewer will wait for both WORKER_2_DONE and WORKER_3_DONE.
