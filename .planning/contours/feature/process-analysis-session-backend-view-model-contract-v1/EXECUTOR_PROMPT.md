## Executor Prompt (Compatibility Summary)

Contour: `feature/process-analysis-session-backend-view-model-contract-v1`  
Run ID: `20260520T224346Z-55320`  
Execution mode: `single-lane`

Agent 2 receives `EXECUTOR_PART_1_PROMPT.md` and performs the substantive backend source-truth and contract design work.

Agent 3 receives `EXECUTOR_PART_2_PROMPT.md` and performs shell-only merge of Agent 2 results into `EXEC_REPORT.md`.

There is no parallel LLM execution. Agent 3 is a no-LLM shell handoff.
