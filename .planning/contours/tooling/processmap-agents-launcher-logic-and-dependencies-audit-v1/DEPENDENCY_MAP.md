# DEPENDENCY_MAP

## Local

- `/Users/mac/Desktop/ProcessMap Agents.command`
- `/Users/mac/bin/processmap-iterm-agents.sh`
- `/Users/mac/bin/processmap-iterm-agents-3windows.sh`
- `/Users/mac/bin/processmap-agent-pane.sh`
- `/usr/bin/ssh`
- `/usr/bin/osascript`
- `/Applications/iTerm.app`

## Server

- SSH target: `root@clearvestnic.ru`
- Root: `/opt/processmap-test`
- Agent scripts:
  - `tools/pm-agent1-planner.sh`
  - `tools/pm-agent2-executor-watch.sh`
  - `tools/pm-agent3-reviewer-watch.sh`
- Helpers:
  - `tools/pm-agent-status.sh`
  - `tools/pm-agent-reset-stale.sh`
  - `tools/pm-agent-mirror-report.sh`
- RAG:
  - `tools/rag/pm-rag-agent-preflight.mjs`
- GSD:
  - `/opt/processmap-test/bin/gsd`
  - `/root/.codex/get-shit-done/bin/gsd-tools.cjs`
- Runtime commands:
  - `/usr/bin/node`
  - `/usr/bin/git`
  - `/root/.local/bin/kimi` via exported PATH

## Contour Reports

- `/opt/processmap-test/.planning/contours/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/`
- `/srv/obsidian/project-atlas/ProcessMap/AgentReports/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/`
