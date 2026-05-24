# Stale downstream markers superseded

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Новый Run ID: `20260518T150609Z-73248`

## Что сделано

Перед и сразу после публикации нового `READY_FOR_EXECUTION` удалены stale downstream marker/report files от предыдущего execution/review cycle:

- `WORKER_2_DONE`
- `WORKER_3_DONE`
- `READY_FOR_MERGE_PART_1`
- `READY_FOR_MERGE_PART_2`
- `EXECUTION_PART_1_STARTED`
- `EXECUTION_PART_2_STARTED`
- `READY_FOR_REVIEW`
- `EXEC_REPORT.md`
- stale Worker/Executor/Reviewer report outputs with old run evidence

Historical evidence по предыдущему cycle сохранён в Project Atlas handoff/mirror notes и не должен использоваться как completion evidence для нового run.

## Причина

Новый planning run должен запускать Agent 2 и Agent 3 заново. Старые completion markers не должны выглядеть как completion evidence для `20260518T150609Z-73248`.
