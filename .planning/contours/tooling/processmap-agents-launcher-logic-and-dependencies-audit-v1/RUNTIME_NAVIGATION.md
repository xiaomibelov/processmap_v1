# Runtime Navigation

## Local Mac Files

- `~/Desktop/ProcessMap Agents.command`
- `~/bin/processmap-iterm-agents.sh`
- `~/bin/processmap-iterm-agents-3windows.sh`
- `~/bin/processmap-agent-pane.sh` if helpers still route through it

## Server

- SSH target: `root@clearvestnic.ru`
- Project root: `/opt/processmap-test`
- Agent 1 server script: `/opt/processmap-test/tools/pm-agent1-planner.sh`
- Agent 2 server script: `/opt/processmap-test/tools/pm-agent2-executor-watch.sh`
- Agent 3 server script: `/opt/processmap-test/tools/pm-agent3-reviewer-watch.sh`
- Status script: `/opt/processmap-test/tools/pm-agent-status.sh`
- Reset stale script: `/opt/processmap-test/tools/pm-agent-reset-stale.sh`
- Mirror helper: `/opt/processmap-test/tools/pm-agent-mirror-report.sh`
- RAG preflight CLI: `/opt/processmap-test/tools/rag/pm-rag-agent-preflight.mjs`

## Validation Commands

Local:

```bash
bash -n "$HOME/Desktop/ProcessMap Agents.command"
bash -n "$HOME/bin/processmap-iterm-agents.sh"
bash -n "$HOME/bin/processmap-iterm-agents-3windows.sh"
```

Server:

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

Status:

```bash
ssh root@clearvestnic.ru '
cd /opt/processmap-test
./tools/pm-agent-status.sh "tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1" || true
'
```

RAG preflight:

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

## Notes

- Split mode `[1]` crash is solved and is not the target.
- No frontend UI/browser proof is needed unless launcher behavior is manually tested.
- Do not kill live agents without explicit confirmation.
- Do not inspect SSH private keys or print secrets.
- Do not edit product runtime files.
