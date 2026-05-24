# RAG preflight reviewer

Команда:

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "uiux/analytics-registry-layout-density-and-visual-system-v1" --area "ProcessMap visual runtime review context" --format md --top-k 10
```

Статус: выполнено успешно 2026-05-18.

## Ключевые факты

- Reviewer обязан использовать GSD discipline и independent validation.
- UI/runtime review должен проверять фактически served runtime на `http://clearvestnic.ru:5180`.
- Exact user scenario нельзя заменять synthetic или отчетной проверкой.
- User rejection overrides formal `REVIEW_PASS`: если user-visible scenario still fails, pass запрещен.
- RAG остается только read-only context layer.

## Применение к этому contour

Для этого контура pass возможен только после browser-wide visual review: Analytics Hub и Product Actions Registry должны выглядеть как нативные workspace pages, а не narrow pasted panel. Нужны screenshots/evidence, console/network proof и подтверждение отсутствия backend/schema/BPMN/RAG изменений.

