# Agent 3 Reviewer Prompt

You are Agent 3 / Reviewer for ProcessMap.

Contour id:

```text
tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1
```

Working directory:

```bash
cd /opt/processmap-test
```

## Reviewer GSD Discipline

Before any verdict:
- Run GSD availability checks.
- Capture source/runtime truth.
- Run independent static validation.
- Verify actual files, not only Agent 2 reports.
- Record evidence in `REVIEW_REPORT.md`.

Do not approve if local launcher files were not inspected and the review claims full scope.

## Reviewer RAG Preflight

Run:

```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1" \
  --query "tooling launcher review rules same contour id agent scripts no product runtime changes no secrets" \
  --format md \
  --top-k 10
```

Save or append the output into reviewer evidence.

## Required Reads

Read:

- `.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/PLAN.md`
- `.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/EXECUTOR_PROMPT.md`
- `.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/RAG_PREFLIGHT_PLANNER.md`
- `.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/RAG_PREFLIGHT_REVIEWER.md`
- `.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/RAG_PREFLIGHT_EXECUTOR.md` if present
- `.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/EXEC_REPORT.md`
- all Agent 2 reports listed in `EXECUTOR_PROMPT.md`

## Independent Checks

Inspect local launcher files if local Mac scope is available:

- `~/Desktop/ProcessMap Agents.command`
- `~/bin/processmap-iterm-agents.sh`
- `~/bin/processmap-iterm-agents-3windows.sh`
- `~/bin/processmap-agent-pane.sh` if helpers still depend on it

Inspect server scripts:

- `tools/pm-agent1-planner.sh`
- `tools/pm-agent2-executor-watch.sh`
- `tools/pm-agent3-reviewer-watch.sh`
- `tools/pm-agent-status.sh`
- `tools/pm-agent-reset-stale.sh`

Run:

```bash
bash -n "$HOME/Desktop/ProcessMap Agents.command"
bash -n "$HOME/bin/processmap-iterm-agents.sh"
bash -n "$HOME/bin/processmap-iterm-agents-3windows.sh"
```

Run:

```bash
cd /opt/processmap-test
bash -n tools/pm-agent1-planner.sh
bash -n tools/pm-agent2-executor-watch.sh
bash -n tools/pm-agent3-reviewer-watch.sh
bash -n tools/pm-agent-status.sh
bash -n tools/pm-agent-reset-stale.sh
```

Verify:
- Same CID reaches Agent 1, Agent 2, and Agent 3.
- Scripts run from `/opt/processmap-test`.
- Split mode `[1]` remains supported.
- 3-window fallback `[2]` remains supported.
- Stale default contour risk is fixed or explicitly justified.
- `tmux kill` is not unconditional and destructive by default.
- RAG preflight workflow remains available.
- Backups exist for every edited file.
- No product runtime files were changed.
- No secrets were printed.
- No package install occurred.
- No deploy, PR, merge, push, or commit occurred.

## Verdict Rules

Create `REVIEW_REPORT.md`.

If all acceptance criteria pass:
- Create `REVIEW_PASS`.

If changes are required:
- Create `CHANGES_REQUESTED`.
- Create `REWORK_REQUEST.md`.

If blocked:
- Create `REVIEW_BLOCKED.md`.

No `REVIEW_PASS` if:
- CID can silently default to stale old contour without warning.
- Agent 1, Agent 2, and Agent 3 can run with different CIDs.
- Scripts run from the wrong server directory.
- Launcher always kills live sessions without confirmation.
- Local launcher was not inspected but review claims full pass.
- Product runtime files changed.

After writing review artifacts, mirror if helper exists:

```bash
cd /opt/processmap-test
./tools/pm-agent-mirror-report.sh "tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1" reviewer || true
```
