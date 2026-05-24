# Agent scripts installed

Created: 2026-05-14T12:01:50+00:00
Host: clearvestnic.ru

Scripts:
- tools/pm-agent1-planner.sh
- tools/pm-agent2-executor-watch.sh
- tools/pm-agent3-reviewer-watch.sh
- tools/pm-agent-status.sh

Model:
- Agent 1 runs Planner interactively.
- Agent 2 waits for READY_FOR_EXECUTION, then launches Kimi.
- Agent 3 waits for READY_FOR_REVIEW + EXEC_REPORT.md, then launches Kimi.
