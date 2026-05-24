# VALIDATION_RESULTS

## Local Static Validation

Passed:

```bash
bash -n "$HOME/Desktop/ProcessMap Agents.command"
bash -n "$HOME/bin/processmap-iterm-agents.sh"
bash -n "$HOME/bin/processmap-iterm-agents-3windows.sh"
bash -n "$HOME/bin/processmap-agent-pane.sh"
```

## Server Static Validation

Passed:

```bash
bash -n tools/pm-agent1-planner.sh
bash -n tools/pm-agent2-executor-watch.sh
bash -n tools/pm-agent3-reviewer-watch.sh
bash -n tools/pm-agent-status.sh
bash -n tools/pm-agent-reset-stale.sh
```

## Dry-run Validation

Passed:

```bash
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents.sh" tooling/launcher-smoke-test-v1
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents-3windows.sh" tooling/launcher-smoke-test-v1
```

Both modes printed A1/A2/A3 commands with the same CID.

Passed:

```bash
printf '\n1\nn\n\n' | PROCESSMAP_DEFAULT_CID=tooling/launcher-smoke-test-v1 PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/Desktop/ProcessMap Agents.command"
```

Main launcher completed dry-run with rc 0 and did not open iTerm panes/windows.

## Validation of Rejections

Passed:

```bash
PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/bin/processmap-iterm-agents.sh" 'bad cid'
```

Result: rejected with rc 2.

Passed:

```bash
printf '\n3\n2\nn\n\n' | PROCESSMAP_DEFAULT_CID=tooling/launcher-smoke-test-v1 PROCESSMAP_AGENTS_DRY_RUN=1 "$HOME/Desktop/ProcessMap Agents.command"
```

Result: mode `3` rejected, mode `2` accepted after retry.

## Status Validation

Passed:

```bash
cd /opt/processmap-test
./tools/pm-agent-status.sh tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1
```

Status now shows run IDs and RAG preflight artifacts.
