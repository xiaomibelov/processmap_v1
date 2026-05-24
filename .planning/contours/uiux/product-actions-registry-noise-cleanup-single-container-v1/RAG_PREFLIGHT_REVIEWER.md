# RAG Preflight — Reviewer (template)

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- launcher_run_id: `20260518T164643Z-83747`
- role: reviewer (template prepared by Planner; Reviewer must rerun on its own session)

## Команда (Reviewer должен запустить сам перед review)

```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "uiux/product-actions-registry-noise-cleanup-single-container-v1" \
  --area "product actions registry inner page UX runtime review" \
  --format md --top-k 10
```

Сохранить вывод в `RAG_PREFLIGHT_REVIEWER_EXEC.md`. Этот файл — лишь шаблон/чек-лист требований к препрофлайту.

## Обязательные факты (которые Reviewer должен учесть)

- RAG read-only. Не использовать для авто-мутаций.
- Для UI/runtime-контура **обязателен** свежий runtime-захват на `http://clearvestnic.ru:5180` с no-cache.
- Reviewer должен воспроизвести **точный** пользовательский сценарий из `PLAN.md` §3 и `RUNTIME_PROOF_CHECKLIST.md`.
- Source/unit-tests review **не заменяет** runtime proof.
- Diagram performance уроки прошлых контуров (mouse-drag) тут не релевантны, но дисциплина «реальный runtime, а не синтетика» — применима.

## Required gates (Reviewer)

- [ ] GSD discipline зафиксирована в `REVIEW_REPORT.md`.
- [ ] Fresh runtime curl + DOM snapshot собраны.
- [ ] Прогон `RUNTIME_PROOF_CHECKLIST.md` C–H выполнен.
- [ ] Forbidden patterns проверены в DevTools и через grep.
- [ ] Scope-safety: diff в скоупе white-list `BRANCH_SCOPE_CHECKLIST.md` §C.
- [ ] Версия bump-нута и видима в build-info / DOM-метке.
- [ ] Verdict: `REVIEW_PASS` / `CHANGES_REQUESTED` / `REVIEW_BLOCKED`.

## Suggested follow-up queries

```bash
node tools/rag/pm-rag-search.mjs "product actions registry analytics hub UX" --top-k 5
node tools/rag/pm-rag-search-facts.mjs "registry visual noise reduction" --top-k 8 --json
```
