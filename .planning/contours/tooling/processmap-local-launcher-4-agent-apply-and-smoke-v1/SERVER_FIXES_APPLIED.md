# SERVER_FIXES_APPLIED

## Fix 1: pm-agent2-executor-watch.sh — Worker 2 Completion Marker

### Backup
- `tools/pm-agent2-executor-watch.sh.backup_20260517_005331`

### Changes
1. Добавлена поддержка split-executor prompt файлов:
   - Проверяет `EXECUTOR_PART_1_PROMPT.md`
   - Проверяет `WORKER_2_PROMPT.md`
   - Fallback на `EXECUTOR_PROMPT.md`
2. Условие запуска изменено: вместо `READY_FOR_REVIEW` теперь проверяется отсутствие `WORKER_2_DONE`.
3. Добавлено создание `WORKER_2_DONE` после выхода kimi.
4. Prompt переведён на английский.

### Diff Summary
- До: скрипт создавал `EXECUTION_STARTED`, запускал kimi, выходил без worker-маркера.
- После: скрипт создаёт `WORKER_2_DONE`, что позволяет Agent 4 отследить завершение Worker 2.

## Fix 2: pm-agent3-reviewer-watch.sh — Rewrite to Worker Script

### Backup
- `tools/pm-agent3-reviewer-watch.sh.backup_20260516_192803` (от предыдущего контура)
- `tools/pm-agent3-reviewer-watch.sh.backup_20260517_005331` (перед текущими правками)

### Changes
1. **Полное переписывание** из reviewer-скрипта в worker-скрипт.
2. Теперь ожидает `READY_FOR_EXECUTION` (вместо `READY_FOR_REVIEW`).
3. Поддерживает split-executor prompt файлы:
   - `EXECUTOR_PART_2_PROMPT.md`
   - `WORKER_3_PROMPT.md`
   - Fallback на `EXECUTOR_PROMPT.md`
4. Создаёт `WORKER_3_STARTED` перед запуском kimi.
5. Создаёт `WORKER_3_DONE` после завершения kimi.
6. Prompt генерируется на английском.
7. Скрипт вызывает mirror report как executor (а не reviewer).

### Diff Summary
- До: reviewer ждал `READY_FOR_REVIEW`, создавал `REVIEW_STARTED`, генерировал reviewer prompt на русском.
- После: worker ждёт `READY_FOR_EXECUTION`, создаёт `WORKER_3_STARTED`/`WORKER_3_DONE`, генерирует worker prompt на английском.

## Rationale

В 4-agent workflow Agent 3 является worker (а не reviewer). Reviewer — это Agent 4. Для корректной работы Agent 4 требуются маркеры `WORKER_2_DONE` и `WORKER_3_DONE`. Старые скрипты их не создавали, что блокировало запуск Agent 4.

Имя `pm-agent3-reviewer-watch.sh` сохранено, чтобы локальный Mac launcher (который вызывает скрипт по имени) продолжал работать без изменений.

## Verification After Fixes

```bash
bash -n tools/pm-agent2-executor-watch.sh  # OK
bash -n tools/pm-agent3-reviewer-watch.sh  # OK
```

All 7 server scripts pass `bash -n`.
