# Agent 2 / Worker Prompt — Local Mac Launcher Apply & Smoke

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
`tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1`

## Scope — Work Package A
Apply and verify the **local Mac launcher** supports the 4-agent workflow.

Old: Agent 1 → Agent 2 → Agent 3
New: Agent 1 → Agent 2 + Agent 3 → Agent 4

## Mandatory: RAG Preflight
Before any work, run:
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --contour "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1" \
  --area "local Mac launcher 4-agent apply smoke split mode CID validation dry-run iTerm" \
  --format md \
  --top-k 10
```
Save output to:
`.planning/contours/tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1/RAG_PREFLIGHT_WORKER_2.md`

## Mandatory: Source Truth
Capture local source truth:
```bash
pwd
whoami
hostname
date -Is
echo "PATH=$PATH"
ls -la "$HOME/Desktop" | grep -i "ProcessMap" || true
ls -la "$HOME/bin" | grep -E "processmap|agent|iterm" || true
```

If local files are missing (you are on Linux server, not Mac), document this explicitly and create `LOCAL_MAC_UNAVAILABLE.md` or update the existing one.

## Files to Inspect
1. `~/Desktop/ProcessMap Agents.command`
2. `~/bin/processmap-iterm-agents.sh`
3. `~/bin/processmap-iterm-agents-3windows.sh`
4. `~/bin/processmap-agent-pane.sh`

For each file:
- Read the first 520 lines.
- Run `bash -n` to validate syntax.
- Document current behavior.
- Identify what needs to change for 4-agent support.

## Backup Rule
Before editing any local file, create a backup:
```bash
cp "$file" "$file.backup_$(date +%Y%m%d_%H%M%S)"
```
If you cannot edit local files (e.g., you are on a server), document this and create `LOCAL_LAUNCHER_NO_FIX_REQUIRED.md` with a detailed checklist of what **should** change. Also reference `LOCAL_MAC_UNAVAILABLE.md`.

## Exact Target Specifications

If you have Mac access, the local files should match these specifications. If you do not have access, document these as the target.

### `~/bin/processmap-agent-pane.sh` (Pane Helper)
Must accept agent numbers 1-4 and map them correctly:
- `1` → run `tools/pm-agent1-planner.sh "$CID"`
- `2` → run `tools/pm-agent2-executor-watch.sh "$CID"`
- `3` → run `tools/pm-agent3-reviewer-watch.sh "$CID"`
- `4` → run `tools/pm-agent4-reviewer-watch.sh "$CID"`

Must validate CID with regex: `^[A-Za-z0-9_./-]+$`.
Must reject invalid CIDs with `exit 2`.
Must support `PROCESSMAP_AGENTS_DRY_RUN=1` by printing the command instead of executing.
Must `cd /opt/processmap-test` before running server scripts.

### `~/bin/processmap-iterm-agents.sh` (Split Mode)
Must create 4 iTerm split panes (not 3).
Suggested layout: 2×2 grid or 3+1 vertical split.
Must call `processmap-agent-pane.sh` for agents 1, 2, 3, 4.
Must pass the exact same CID to all 4 calls.
Must support `PROCESSMAP_AGENTS_DRY_RUN=1` by printing:
```
[Dry-run] A1: processmap-agent-pane.sh 1 <CID>
[Dry-run] A2: processmap-agent-pane.sh 2 <CID>
[Dry-run] A3: processmap-agent-pane.sh 3 <CID>
[Dry-run] A4: processmap-agent-pane.sh 4 <CID>
```
Must NOT open iTerm or execute commands in dry-run mode.

### `~/bin/processmap-iterm-agents-3windows.sh` (Fallback Mode)
Must create 4 visible agent contexts (can be 4 windows, or 3 windows with one split into 2 panes).
Agent 4 must have a dedicated visible context.
Must call `processmap-agent-pane.sh` for agents 1, 2, 3, 4.
Must pass the exact same CID to all 4 calls.
Must support `PROCESSMAP_AGENTS_DRY_RUN=1` with same output format as split mode.

### `~/Desktop/ProcessMap Agents.command` (Main Launcher)
Must require explicit CID unless `PROCESSMAP_DEFAULT_CID` is set.
Must validate CID with `^[A-Za-z0-9_./-]+$`.
Must reject spaces and invalid characters.
Must prompt for mode: `1` = split panes, `2` = multi-window fallback.
Must reject invalid mode (not 1 or 2) and re-prompt.
Must pass the same CID to the chosen helper script.
Must support `PROCESSMAP_AGENTS_DRY_RUN=1`.
`tmux kill-session -t processmap-agents` must remain opt-in (explicit confirmation required).

## Required Changes

### 1. Support 4 Agents in Split Mode [1]
If `processmap-iterm-agents.sh` uses iTerm split panes:
- Add a 4th pane for Agent 4 / Reviewer.
- Label it clearly: `A4-reviewer`.
- Preserve existing split layout logic.

### 2. Support 4 Agents in Fallback Mode [2]
If `processmap-iterm-agents-3windows.sh` uses multiple iTerm windows:
- Either add a 4th window, OR
- Add Agent 4 into one of the existing windows via split pane.
- The key requirement: **Agent 4 must have a dedicated visible context**.

### 3. CID Validation Preserved
Ensure the same CID validation rules are applied:
- Allowed: `A-Z a-z 0-9 _ - / .`
- Reject invalid CIDs with error message.
- Pass the exact same CID to all 4 agent launch commands.

### 4. Dry-Run Preserved
If `PROCESSMAP_AGENTS_DRY_RUN=1` is set:
- Print the constructed commands instead of executing them.
- Prove that the same CID appears in all 4 agent command lines.
- Do not launch `kimi` or `tmux` or `osascript` in dry-run mode.

### 5. tmux Kill Remains Opt-In
If there is a tmux kill step:
- It must remain opt-in (e.g., require explicit flag or confirmation).
- Do not make it automatic or default.

### 6. `processmap-agent-pane.sh` Compatibility
- Add `AGENT=4` branch that calls `pm-agent4-reviewer-watch.sh`.
- Ensure the script name matches the actual server file: `tools/pm-agent4-reviewer-watch.sh`.
- Keep `AGENT=1/2/3` branches unchanged except for safe quoting.

## Validation Commands

### bash -n
```bash
bash -n "$HOME/Desktop/ProcessMap Agents.command"
bash -n "$HOME/bin/processmap-iterm-agents.sh"
bash -n "$HOME/bin/processmap-iterm-agents-3windows.sh"
bash -n "$HOME/bin/processmap-agent-pane.sh"
```

### Dry-run (split mode)
```bash
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents.sh" "tooling/test-cid-v1"
```
Expected output contains 4 lines, each with `tooling/test-cid-v1`.

### Dry-run (fallback mode)
```bash
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents-3windows.sh" "tooling/test-cid-v1"
```
Expected output contains 4 lines, each with `tooling/test-cid-v1`.

### CID rejection test
```bash
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents.sh" "bad cid"
```
Expected: non-zero exit code and error message.

### Main launcher dry-run
```bash
printf '\n1\nn\n\n' | PROCESSMAP_DEFAULT_CID=tooling/test-cid-v1 PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/Desktop/ProcessMap Agents.command"
```
Expected: rc=0, 4 commands with CID, iTerm not opened.

## Required Outputs

### WORKER_2_REPORT.md (Russian)
Must contain:
1. Source truth (whoami, hostname, date).
2. Local file availability status.
3. RAG preflight summary.
4. Files inspected / changes applied.
5. bash -n results.
6. Dry-run results (or expected results if not runnable).
7. CID propagation proof.
8. Limitations documented.

### LOCAL_LAUNCHER_AUDIT.md (Russian)
Audit of each local file: what was found, what was changed, what remains.

### LOCAL_LAUNCHER_FIXES_APPLIED.md or LOCAL_LAUNCHER_NO_FIX_REQUIRED.md (Russian)
- If fixes applied: list backups, diffs, what changed.
- If no fix applied: detailed checklist of what SHOULD change.

### LOCAL_CID_PROPAGATION_4_AGENT.md (Russian)
Proof that the same CID reaches Agent 1/2/3/4.

### LOCAL_DRY_RUN_RESULTS.md (Russian)
Actual dry-run output (or expected output if dry-run not possible).

### LOCAL_VALIDATION_RESULTS.md (Russian)
Checklist of all validation items with PASS/FAIL/NOT_RUN status.

### WORKER_2_DONE
Create this empty marker file when all reports are written:
```bash
touch .planning/contours/tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1/WORKER_2_DONE
```

## Boundaries
- NO product runtime changes.
- NO frontend/backend changes.
- NO .env or secrets changes.
- NO package installation.
- NO commit/push/PR/deploy.
- If blocked, create WORKER_2_BLOCKED.md with exact reason.
