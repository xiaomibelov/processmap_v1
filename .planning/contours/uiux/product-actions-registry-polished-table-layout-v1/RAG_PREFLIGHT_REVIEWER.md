# RAG_PREFLIGHT_REVIEWER

Контур: `uiux/product-actions-registry-polished-table-layout-v1`  
Роль: reviewer  
Команда:

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "uiux/product-actions-registry-polished-table-layout-v1" --area "Product Actions Registry UI runtime review gates" --format md --top-k 10
```

## Статус

Выполнено: `2026-05-18T10:20:50Z`.

## Существенные факты

- Reviewer обязан использовать GSD discipline и не approve без independent runtime validation.
- UI/runtime review должен подтвердить fresh runtime на `http://clearvestnic.ru:5180`.
- Product Actions durable truth source: `interview.analysis.product_actions[]`.
- Product Actions нельзя писать в BPMN XML.
- RAG является read-only suggestion/context layer.

## Подсказки RAG

RAG поднял прошлые Product Actions Registry review prompts/reports и напомнил, что formal `REVIEW_PASS` недостаточен, если user-visible scenario остается плохим. Поэтому Agent 4 gate формулируется как browser-visible visual review, а не только tests/build.

## Required reviewer gates

- Reviewer GSD discipline present.
- Fresh runtime proof collected.
- Exact user scenario reproduced.
- Before/after evidence collected.
- User rejection override checked.
- No `REVIEW_PASS`, если визуальная проблема сохраняется.
- Product runtime changes stay inside declared scope.
