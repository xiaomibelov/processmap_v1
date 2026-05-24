# tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1

## GSD Discipline

Agent 1 performed planning only. No implementation, no product runtime changes, no commit, no push, no PR, no deploy, no package install, and no secret inspection were performed.

Commands run:

```bash
echo "=== LOCAL MAC GSD CHECK ==="
pwd
whoami
hostname
date -Is
echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
command -v kimi || true
command -v codex || true
```

Local result:
- Current host is `MacBook-Pro-Mac.local`, user `mac`, cwd `/Users/mac`.
- `date -Is` is not supported by the local BSD `date`; Agent 1 also ran `date -u +"%Y-%m-%dT%H:%M:%SZ"` and got `2026-05-16T19:07:12Z`.
- `gsd` was not found on local PATH.
- `gsd-sdk` was found at `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`.
- `codex` was found at `/usr/local/bin/codex`.
- `kimi` was not found on local PATH.

Commands run:

```bash
ssh root@clearvestnic.ru '
cd /opt/processmap-test
echo "=== SERVER GSD CHECK ==="
pwd
whoami
hostname
date -Is
echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
find /root/.codex/skills -maxdepth 2 -type d -name "gsd-*" 2>/dev/null | sort | head -50 || true
find /root/.codex/agents -maxdepth 2 -type d -name "gsd-*" 2>/dev/null | sort | head -50 || true
'
```

Server result:
- Server cwd `/opt/processmap-test`, user `root`, host `clearvestnic.ru`.
- `command -v gsd` did not resolve in the default non-login SSH PATH.
- `/opt/processmap-test/bin/gsd` exists and is executable.
- `/root/.codex/get-shit-done/bin/gsd-tools.cjs` exists.
- `/root/.codex/skills` contains GSD skills including `gsd-plan-phase`, `gsd-execute-phase`, `gsd-code-review`, `gsd-debug`, and related workflows.

Selected mode:
- `GSD_PLANNING_WITH_SERVER_WRAPPER_AVAILABLE`.
- Agent 1 used GSD discipline manually because the user provided a complete bounded planning contract.
- GSD repair is out of scope and was not attempted.

## RAG Preflight

Commands run and saved:

```bash
ssh root@clearvestnic.ru '
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1" \
  --area "ProcessMap agents launcher logic dependencies iTerm SSH CID Agent1 Agent2 Agent3 RAG preflight workflow" \
  --format md \
  --top-k 10
'
```

Saved to:

```text
/opt/processmap-test/.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/RAG_PREFLIGHT_PLANNER.md
```

Commands run and saved:

```bash
ssh root@clearvestnic.ru '
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1" \
  --query "tooling launcher review rules same contour id agent scripts no product runtime changes no secrets" \
  --format md \
  --top-k 10
'
```

Saved to:

```text
/opt/processmap-test/.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/RAG_PREFLIGHT_REVIEWER.md
```

Facts used:
- Runtime repo root is `/opt/processmap-test`.
- Active contour root is `/opt/processmap-test/.planning/contours/<CID>`.
- Agent 1 must use GSD discipline, create `PLAN.md`, define acceptance criteria, and write `STATE.json`.
- Agent 3 must independently validate source/runtime truth before pass.
- RAG is read-only suggestion/context layer and must not auto-mutate files.
- No PR, merge, push, or deploy without explicit user command.
- RAG tooling contours must not modify `frontend/src`, backend runtime files, or product runtime code.

Documents used:
- `/opt/processmap-test/tools/install-processmap-agent-scripts.sh`
- `/opt/processmap-test/tools/pm-agents-server-tmux.sh`
- ProcessMap RAG architecture and source registry contour reports.
- GSD availability/root-cause diagnostic repair options.

Relevant hard rules:
- No product runtime changes.
- No secrets printed.
- No frontend/backend app changes.
- No package install.
- No deploy, PR, merge, or push.
- Reviewer must not grant full pass if local launcher was not inspected.

How preflight changed the plan:
- The plan explicitly treats RAG as read-only context and keeps launcher fixes bounded to tooling files.
- The plan requires Agent 2 and Agent 3 to run their own role-specific preflights.
- The plan includes a strict no-product-runtime gate even though the server worktree currently has unrelated product runtime modifications.

## Source Truth - Local Mac

Local source truth was inspected on the Mac. Required files exist:

- `~/Desktop/ProcessMap Agents.command`
- `~/bin/processmap-iterm-agents.sh`
- `~/bin/processmap-iterm-agents-3windows.sh`

Observed permissions:

```text
-rwxr-xr-x /Users/mac/Desktop/ProcessMap Agents.command
-rwxr-xr-x /Users/mac/bin/processmap-iterm-agents.sh
-rwxr-xr-x /Users/mac/bin/processmap-iterm-agents-3windows.sh
```

Local dependencies:
- `ssh` found at `/usr/bin/ssh`.
- `osascript` found at `/usr/bin/osascript`.
- `tmux` found at `/usr/local/bin/tmux`.
- iTerm is running (`/Applications/iTerm.app/Contents/MacOS/iTerm2`).

Important observations for Agent 2:
- Main launcher still defaults to `tooling/project-atlas-server-docs-import-and-triage-v1`.
- Main launcher always runs `ssh root@clearvestnic.ru 'tmux kill-session -t processmap-agents 2>/dev/null || true' || true` before launching.
- Split and 3-window helpers also default to the same old contour if called without an argument.
- Split and 3-window helpers build commands for `~/bin/processmap-agent-pane.sh`, not direct SSH commands to `/opt/processmap-test/tools/pm-agent1-planner.sh`, `/opt/processmap-test/tools/pm-agent2-executor-watch.sh`, and `/opt/processmap-test/tools/pm-agent3-reviewer-watch.sh`.
- CID is shell-quoted with `printf '%q'` when building pane commands, and slash-containing CIDs are expected to work.

## Source Truth - Server

Server source truth command was run from `/opt/processmap-test`.

Observed:
- Branch: `fix/lockfile-sync-test`.
- HEAD: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`.
- `origin/main`: `d805e1c64c1107b9e3fe6854e031694bf741b187`.
- Worktree has unrelated modified product runtime files under `frontend/src` and `frontend/vite.config.js`; Agent 2 must not touch them.
- Server agent scripts exist and are executable:
  - `tools/pm-agent1-planner.sh`
  - `tools/pm-agent2-executor-watch.sh`
  - `tools/pm-agent3-reviewer-watch.sh`
  - `tools/pm-agent-status.sh`
  - `tools/pm-agent-reset-stale.sh`

Observed dependencies:
- `tmux` found at `/usr/bin/tmux`.
- `node` found at `/usr/bin/node`.
- `git` found at `/usr/bin/git`.
- `kimi` did not resolve in default non-login SSH PATH during the server source-truth command, but the agent scripts export `/root/.local/bin` and previous targeted checks showed `/root/.local/bin/kimi`.
- RAG preflight CLI exists at `tools/rag/pm-rag-agent-preflight.mjs`.

Server script observations:
- `pm-agent1-planner.sh` creates the contour dir and prompt, exports GSD-related variables, `cd`s to `/opt/processmap-test`, then launches `kimi` interactively.
- `pm-agent2-executor-watch.sh` waits for `READY_FOR_EXECUTION` plus `EXECUTOR_PROMPT.md`, writes `EXECUTION_STARTED`, then launches `kimi`.
- `pm-agent3-reviewer-watch.sh` waits for `READY_FOR_REVIEW` plus `EXEC_REPORT.md`, writes `REVIEW_STARTED`, then launches `kimi`.
- `pm-agent-reset-stale.sh` only removes `EXECUTION_STARTED` or `REVIEW_STARTED` when downstream outputs are absent; this is safer than deleting all markers.

## Problem Statement

The ProcessMap Agents desktop launcher must safely start three agents for one selected contour and must not silently launch a stale default contour, accidentally kill active agents, or bypass the intended server agent scripts and RAG/GSD workflow.

Current risk areas:
- Stale hard-coded default contour can be launched by pressing Enter.
- Unconditional `tmux kill-session -t processmap-agents` can interrupt active server-side sessions.
- Local helpers currently route through `~/bin/processmap-agent-pane.sh`, while the desired contract says each pane/window should run the server scripts from `/opt/processmap-test`.
- Invalid mode handling falls through to split mode.
- CID validation is missing.
- Existing planning packs need a compatibility marker for the current local helper: `AGENT_RUN_ID`.

## Launcher Logic Audit Plan

Agent 2 must answer:

- Is `DEFAULT_CID="tooling/project-atlas-server-docs-import-and-triage-v1"` stale for current usage?
- Can pressing Enter silently launch stale work? If yes, fix by making CID explicit or safely defaulted.
- If a default remains, should it come from an environment variable, recent contour list, or no default?
- Should the launcher require confirmation before launching a default?
- Is empty CID rejected after trimming?
- Is selected CID printed clearly immediately before launch?
- Are destructive or interrupting actions gated by explicit confirmation?

Preferred outcome:
- CID is explicit by default, or default is clearly sourced and confirmed.
- The selected CID is printed in a final launch summary.
- Old split crash is not treated as active scope.

## Dependency Map Plan

Agent 2 must produce `DEPENDENCY_MAP.md` with:

Local:
- `~/Desktop/ProcessMap Agents.command`
- `~/bin/processmap-iterm-agents.sh`
- `~/bin/processmap-iterm-agents-3windows.sh`
- `~/bin/processmap-agent-pane.sh` as an observed dependency if helpers still use it
- `ssh`
- `osascript`
- iTerm
- optional `tmux`

Server:
- `root@clearvestnic.ru`
- `/opt/processmap-test`
- `tools/pm-agent1-planner.sh`
- `tools/pm-agent2-executor-watch.sh`
- `tools/pm-agent3-reviewer-watch.sh`
- `tools/pm-agent-status.sh`
- `tools/pm-agent-reset-stale.sh`
- `tools/pm-agent-mirror-report.sh`
- `tools/rag/pm-rag-agent-preflight.mjs`
- `/opt/processmap-test/bin/gsd`
- `/root/.codex/get-shit-done/bin/gsd-tools.cjs`
- `/root/.local/bin/kimi`
- `/usr/bin/node`
- Project Atlas mirror path `/srv/obsidian/project-atlas/ProcessMap/AgentReports/<CID>/`

## CID Propagation Plan

Mandatory audit checklist:

- Main launcher passes exactly `"$CID"` to selected helper.
- Split helper passes the same CID to Agent 1, Agent 2, and Agent 3.
- 3-window helper passes the same CID to Agent 1, Agent 2, and Agent 3.
- CID is quoted safely at every shell boundary.
- CID with slash works, e.g. `perf/process-stage-baseline-jank-v1`.
- CID containing spaces is rejected or proven safely quoted; preferred fix is reject spaces.
- Allowed CID pattern: `^[A-Za-z0-9_./-]+$`.
- Empty CID is rejected unless a clearly confirmed default is used.

## Server Agent Script Plan

Desired invocation contract:

```bash
cd /opt/processmap-test
./tools/pm-agent1-planner.sh "$CID"
./tools/pm-agent2-executor-watch.sh "$CID"
./tools/pm-agent3-reviewer-watch.sh "$CID"
```

Agent 2 must verify whether the local launcher actually uses that contract. If current helpers use `~/bin/processmap-agent-pane.sh`, Agent 2 must either:
- justify that wrapper as the supported orchestrator and prove it launches from `/opt/processmap-test`; or
- change only the allowed launcher/helper files so the panes call the server scripts directly; or
- create `EXEC_BLOCKED.md` if the necessary fix requires editing a non-allowed local dependency.

The scripts must not run Kimi from `/root`, `/tmp`, or a wrong worktree.

## Stale Marker / tmux Safety Plan

Mandatory audit checklist:

- Determine whether the launcher should ever run `tmux kill-session -t processmap-agents`.
- Treat unconditional tmux kill as unsafe unless proven harmless.
- Preferred fix: make kill optional and require confirmation, or replace it with status display plus selected-CID reset.
- `pm-agent-reset-stale.sh` must only reset safe stale markers for the selected CID.
- Launcher must not delete execution/review markers without explicit confirmation.
- Status/debug output must show marker state clearly.
- Existing live agents must not be interrupted without explicit user action.

## RAG Workflow Compatibility Plan

Launcher does not need to run RAG preflight itself. Agent 2 must verify:

- Agent prompts/scripts do not prevent `node tools/rag/pm-rag-agent-preflight.mjs` from running.
- Agent 1 prompt can run planner preflight.
- Agent 2 prompt requires executor preflight.
- Agent 3 prompt requires reviewer preflight.
- Environment passed to SSH contains a PATH where `node`, `kimi`, and GSD wrapper are usable.
- RAG remains read-only context and does not mutate code.

## Bounded Fix Policy

Agent 2 may modify only if necessary and only after creating timestamped backups.

Allowed local files:
- `~/Desktop/ProcessMap Agents.command`
- `~/bin/processmap-iterm-agents.sh`
- `~/bin/processmap-iterm-agents-3windows.sh`

Allowed server tooling files:
- `/opt/processmap-test/tools/pm-agent-status.sh`
- `/opt/processmap-test/tools/pm-agent-reset-stale.sh`
- `/opt/processmap-test/tools/pm-agent1-planner.sh`
- `/opt/processmap-test/tools/pm-agent2-executor-watch.sh`
- `/opt/processmap-test/tools/pm-agent3-reviewer-watch.sh`

Backup requirement before every edit:

```bash
cp "$FILE" "$FILE.backup_$(date +%Y%m%d_%H%M%S)"
```

Agent 2 must not modify:
- `frontend/src`
- backend runtime code
- package files
- `.env`
- Docker Compose files
- Project Atlas sync config
- RAG facts/search tooling unless only documentation/reporting and explicitly justified

Preferred fixes:
- Make CID explicit or safely defaulted.
- Add CID validation: no empty, no spaces, safe chars only.
- Show selected CID clearly.
- Make tmux kill optional with confirmation.
- Add remote preflight/status summary: repo path, branch, HEAD, contour folder existence, `pm-agent-status` if present.
- Ensure same CID reaches all three agents.
- Ensure split mode and 3-window mode remain supported.
- Add a dry-run mode if simple, e.g. `PROCESSMAP_AGENTS_DRY_RUN=1`.

## Validation Plan

Static validation:

```bash
bash -n "$HOME/Desktop/ProcessMap Agents.command"
bash -n "$HOME/bin/processmap-iterm-agents.sh"
bash -n "$HOME/bin/processmap-iterm-agents-3windows.sh"
```

Server static validation:

```bash
ssh root@clearvestnic.ru '
cd /opt/processmap-test
bash -n tools/pm-agent1-planner.sh
bash -n tools/pm-agent2-executor-watch.sh
bash -n tools/pm-agent3-reviewer-watch.sh
bash -n tools/pm-agent-status.sh
bash -n tools/pm-agent-reset-stale.sh
'
```

Server status smoke:

```bash
ssh root@clearvestnic.ru '
cd /opt/processmap-test
./tools/pm-agent-status.sh "tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1" || true
'
```

If a dry-run mode is added:

```bash
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/Desktop/ProcessMap Agents.command"
```

Use test CID:

```text
tooling/launcher-smoke-test-v1
```

Do not spawn uncontrolled long-running agents unless the user explicitly approves a controlled launch test.

## Acceptance Criteria

Agent 3 may pass only if:

- Local launcher files were inspected, or local scope is explicitly marked unavailable.
- Server agent scripts were inspected.
- Dependency map exists.
- Same CID propagation is proven for Agent 1, Agent 2, and Agent 3.
- Scripts run from `/opt/processmap-test` on server.
- Split mode `[1]` remains supported.
- 3-window fallback `[2]` remains supported.
- Old split crash is not treated as active issue.
- Stale default contour risk is addressed or explicitly justified.
- `tmux kill` and stale reset behavior are safe and non-destructive by default.
- CID validation exists or risk is documented with a concrete fix.
- RAG preflight workflow compatibility is verified.
- `bash -n` passes for all touched scripts.
- Backups exist before any edit.
- No product runtime files changed.
- No frontend/backend app changes.
- No `.env` or secrets read/printed.
- No package install.
- No deploy, PR, merge, or push.
- Reports are created and mirrored to Project Atlas where helper exists.

No `REVIEW_PASS` if:
- CID can silently default to stale old contour without warning.
- Agent 1, Agent 2, and Agent 3 can run with different CIDs.
- Scripts run from the wrong server directory.
- Launcher always kills live sessions without confirmation.
- Local launcher was not inspected but review claims full pass.
- Product runtime files were changed.

## Non-goals

- No Product Actions.
- No Diagram performance work.
- No RAG feature implementation.
- No MCP repair.
- No GSD repair.
- No frontend/backend app changes.
- No server deploy.
- No stage/prod deploy.
- No commit, push, or PR.
- No package install.
- No secrets inspection.
- No redesign of iTerm UI.
- No work on old split crash.

## Agent 2 Execution Plan

Agent 2 must:

1. Read `PLAN.md`, `RAG_PREFLIGHT_PLANNER.md`, `RAG_PREFLIGHT_REVIEWER.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, and `STATE.json`.
2. Run executor RAG preflight and save `RAG_PREFLIGHT_EXECUTOR.md`.
3. Inspect local launcher files and observed helper dependencies.
4. Inspect server scripts.
5. Produce dependency map.
6. Produce risk analysis.
7. Apply bounded fixes only if necessary, with backups first.
8. Validate with static checks and status/smoke commands.
9. Create all required reports.
10. Write `READY_FOR_REVIEW` only if not blocked.

Required Agent 2 reports:
- `EXEC_REPORT.md`
- `LOCAL_LAUNCHER_AUDIT.md`
- `SERVER_AGENT_SCRIPTS_AUDIT.md`
- `CID_PROPAGATION_REPORT.md`
- `DEPENDENCY_MAP.md`
- `SAFETY_AND_STALE_MARKERS_REPORT.md`
- `FIXES_APPLIED.md` or `NO_FIX_REQUIRED.md`
- `VALIDATION_RESULTS.md`
- `RUNTIME_BEHAVIOR_IMPACT.md`
- `IMPLEMENTATION_NOTES.md`

If blocked:
- Create `EXEC_BLOCKED.md`.
- Do not create `READY_FOR_REVIEW`.

## Agent 3 Review Plan

Agent 3 must:

1. Run reviewer GSD discipline.
2. Run reviewer RAG preflight.
3. Read all Agent 2 reports.
4. Inspect local launcher files if available.
5. Inspect server scripts.
6. Run independent `bash -n` validation.
7. Verify same CID propagation.
8. Verify safe stale/tmux behavior.
9. Verify RAG workflow compatibility.
10. Verify no product runtime changes.
11. Verify backups if edits were made.
12. Verify no secrets printed.
13. Create `REVIEW_REPORT.md` and either `REVIEW_PASS` or `CHANGES_REQUESTED` plus `REWORK_REQUEST.md`.

## Risks

- Current local helper path uses `~/bin/processmap-agent-pane.sh`, which is outside the explicitly allowed local edit list.
- Default old contour is a real stale-launch risk.
- Unconditional tmux kill may interrupt active agents.
- Server default non-login PATH does not resolve `kimi`, while scripts rely on exported PATH.
- Server worktree has unrelated product runtime changes that Agent 2 must avoid.
- A dry-run mode may be useful but must not introduce behavior divergence from real launch.

## Gates

- `READY_FOR_EXECUTION` may exist only with `PLAN.md`, `EXECUTOR_PROMPT.md`, `REVIEWER_PROMPT.md`, `STATE.json`, and RAG preflight outputs present.
- Agent 2 must not edit without backups.
- Agent 2 must not touch product runtime.
- Agent 3 must not pass if local scope is incomplete.
- Any uncontrolled live-agent launch requires explicit user approval.
