# Agent 2 Executor Prompt

You are Agent 2 / Executor for ProcessMap.

Contour id:

```text
tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1
```

Working directory on server:

```bash
cd /opt/processmap-test
```

Scope:
- Audit and, only if necessary, apply bounded tooling fixes for the local ProcessMap Agents launcher and server agent scripts.
- Keep split mode `[1]` supported.
- Keep 3-window fallback `[2]` supported.
- Do not work on the old split crash; the user says it is already solved.
- Do not change product runtime.

## Required Reads

Read:

- `.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/PLAN.md`
- `.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/RAG_PREFLIGHT_PLANNER.md`
- `.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/RAG_PREFLIGHT_REVIEWER.md`
- `.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/RUNTIME_NAVIGATION.md`
- `.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/RUNTIME_PROOF_CHECKLIST.md`
- `.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/STATE.json`

## Executor RAG Preflight

Run:

```bash
ssh root@clearvestnic.ru '
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --contour "tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1" \
  --area "launcher helper scripts CID propagation dependencies iTerm SSH agent watchers" \
  --format md \
  --top-k 10
'
```

Save output to:

```text
.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/RAG_PREFLIGHT_EXECUTOR.md
```

## Required Audit

Inspect local Mac files:

- `~/Desktop/ProcessMap Agents.command`
- `~/bin/processmap-iterm-agents.sh`
- `~/bin/processmap-iterm-agents-3windows.sh`
- `~/bin/processmap-agent-pane.sh` if helpers still depend on it

Inspect server files:

- `/opt/processmap-test/tools/pm-agent1-planner.sh`
- `/opt/processmap-test/tools/pm-agent2-executor-watch.sh`
- `/opt/processmap-test/tools/pm-agent3-reviewer-watch.sh`
- `/opt/processmap-test/tools/pm-agent-status.sh`
- `/opt/processmap-test/tools/pm-agent-reset-stale.sh`

Answer the audit questions from `PLAN.md`:
- main launcher logic
- mode logic
- CID propagation
- server script invocation
- contour existence behavior
- stale markers and tmux kill safety
- RAG preflight interaction
- dependency map
- safety constraints

## Bounded Fix Policy

You may modify only if necessary and only after creating timestamped backups.

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

Before editing any allowed file:

```bash
cp "$FILE" "$FILE.backup_$(date +%Y%m%d_%H%M%S)"
```

Do not modify:
- `frontend/src`
- backend runtime code
- package files
- `.env`
- Docker Compose files
- Project Atlas sync config
- RAG facts/search tooling unless only docs/reporting and explicitly justified

If the necessary fix requires editing a non-allowed file, create `EXEC_BLOCKED.md` and do not create `READY_FOR_REVIEW`.

## Preferred Fixes

Prefer narrowly scoped fixes that:
- Make CID explicit or safely defaulted.
- Reject invalid CID: empty, spaces, or chars outside `A-Z a-z 0-9 _ - / .`.
- Show selected CID clearly.
- Make tmux kill optional with confirmation.
- Add remote preflight/status summary.
- Ensure helper scripts quote CID.
- Ensure panes/windows stay open after command exits.
- Ensure all three agents use the same CID.
- Preserve split mode `[1]` and fallback `[2]`.
- Add simple dry-run mode if it fits existing structure.

## Validation

Run static validation:

```bash
bash -n "$HOME/Desktop/ProcessMap Agents.command"
bash -n "$HOME/bin/processmap-iterm-agents.sh"
bash -n "$HOME/bin/processmap-iterm-agents-3windows.sh"
```

Run server static validation:

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

Run status smoke:

```bash
ssh root@clearvestnic.ru '
cd /opt/processmap-test
./tools/pm-agent-status.sh "tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1" || true
'
```

If a dry-run mode is implemented, run it with:

```text
tooling/launcher-smoke-test-v1
```

Do not spawn uncontrolled long-running agents unless the user explicitly approves a controlled launch test.

## Required Reports

Create:

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
- `READY_FOR_REVIEW`

If blocked:
- Create `EXEC_BLOCKED.md`.
- Do not create `READY_FOR_REVIEW`.

After writing reports, mirror if helper exists:

```bash
cd /opt/processmap-test
./tools/pm-agent-mirror-report.sh "tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1" executor || true
```

## Hard Stops

Stop and create `EXEC_BLOCKED.md` if:
- Local Mac files are not available and the task cannot be completed as full scope.
- Required fix needs a non-allowed file.
- Product runtime changes would be required.
- CID can still silently default to stale old contour after your changes or explicit justification.
- Launcher still kills live sessions without confirmation.
