# RAG_PREFLIGHT_REVIEWER

Контур: `tooling/registry-analytics-branch-hygiene-and-merge-scope-v1`  
Роль: reviewer  
Команда:

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "tooling/registry-analytics-branch-hygiene-and-merge-scope-v1" --area "ProcessMap branch hygiene merge scope review" --format md --top-k 10
```

## Статус

`PASS_WITH_WARNINGS`: RAG preflight выполнен. Предупреждения применимы как review discipline reminders.

## Ключевые факты RAG

- Reviewer обязан проверять source/runtime truth и не выдавать approval без independent validation.
- No PR, merge, push, deploy без явного user command.
- Для tooling/RAG-like contours нельзя менять product runtime files.
- Pre-existing modifications на `fix/lockfile-sync-test` уже встречались в RAG/context; их нельзя silently смешивать с новым scope.
- User rejection facts по Diagram/perf напоминают: formal `REVIEW_PASS` не заменяет пользовательски видимый proof. Для текущего contour это означает, что accepted Analytics/Registry behavior должен быть сохранён после isolation.

## Учтено в reviewer gate

- `REVIEW_PASS` разрешён только при полной классификации dirty/untracked files.
- Clean branch strategy обязательна.
- Backend/schema/BPMN/RAG изменения запрещены в merge scope без явной classification/justification.
- Generated/evidence artifacts должны быть excluded from product merge scope.
