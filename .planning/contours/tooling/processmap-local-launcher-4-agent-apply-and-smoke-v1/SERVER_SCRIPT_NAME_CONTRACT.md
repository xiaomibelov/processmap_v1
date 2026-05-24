# SERVER_SCRIPT_NAME_CONTRACT

## Mapping: Local Launcher Expected Names → Actual Server Scripts

| Local launcher calls | Expected server path | Actual path | Exists | Executable | Match |
|---------------------|----------------------|-------------|--------|------------|-------|
| `pm-agent1-planner.sh` | `tools/pm-agent1-planner.sh` | `/opt/processmap-test/tools/pm-agent1-planner.sh` | ✅ | ✅ | ✅ |
| `pm-agent2-executor-watch.sh` | `tools/pm-agent2-executor-watch.sh` | `/opt/processmap-test/tools/pm-agent2-executor-watch.sh` | ✅ | ✅ | ✅ |
| `pm-agent3-reviewer-watch.sh` | `tools/pm-agent3-reviewer-watch.sh` | `/opt/processmap-test/tools/pm-agent3-reviewer-watch.sh` | ✅ | ✅ | ✅ |
| `pm-agent4-reviewer-watch.sh` | `tools/pm-agent4-reviewer-watch.sh` | `/opt/processmap-test/tools/pm-agent4-reviewer-watch.sh` | ✅ | ✅ | ✅ |

## Auxiliary Server Scripts

| Script | Path | Exists | Executable | Role |
|--------|------|--------|------------|------|
| `pm-agent-status.sh` | `tools/pm-agent-status.sh` | ✅ | ✅ | 4-agent status display |
| `pm-agent-reset-stale.sh` | `tools/pm-agent-reset-stale.sh` | ✅ | ✅ | Stale marker cleanup |
| `pm-agents-server-tmux.sh` | `tools/pm-agents-server-tmux.sh` | ✅ | ✅ | Server tmux launcher |

## Mismatches

**None.** All script names expected by the local launcher exactly match the actual server script names.

## Note

`pm-agent3-reviewer-watch.sh` был переписан из reviewer-скрипта в worker-скрипт, но имя файла сохранено для совместимости с локальным launcher, который вызывает его по имени для Agent 3.
