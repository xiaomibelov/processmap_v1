# RAG_PREFLIGHT_REVIEWER

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`  
Роль: Agent 1 / Planner для Agent 4 / Reviewer  
Статус: `DONE`

## Команда

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "feature/process-properties-registry-foundation-v1" --area "ProcessMap properties registry reviewer runtime proof" --format md --top-k 10
```

## Ключевой вывод preflight

- Runtime facts:
  - frontend: `http://clearvestnic.ru:5180`;
  - API health: `http://clearvestnic.ru:8088/health`;
  - repo root: `/opt/processmap-test`;
  - active contour root: `/opt/processmap-test/.planning/contours/<CID>`.
- Reviewer обязан проверить fresh runtime, exact user scenario и source/runtime truth.
- `REVIEW_PASS` запрещён без независимого browser proof.
- Предупреждение RAG про user rejection для diagram perf не является прямым blocker этого контура, но усиливает правило: нельзя апрувить по source-only checks.

## Использование в reviewer prompt

- Agent 4 должен открыть runtime на `:5180`.
- Agent 4 должен проверить `Аналитика`, `Реестр действий`, `Реестр свойств`, `Дашборды`.
- Agent 4 должен доказать отсутствие fake property rows/counts и unsafe mutations.

## Raw captured excerpt

```text
# ProcessMap Agent RAG Preflight

Input:
- role: reviewer
- contour: feature/process-properties-registry-foundation-v1
- area/query: ProcessMap properties registry reviewer runtime proof
- generated_at: 2026-05-18T19:37:05.876Z

Runtime Facts:
- server_host: clearvestnic.ru
- repo_root: /opt/processmap-test
- frontend_url: http://clearvestnic.ru:5180
- api_health_url: http://clearvestnic.ru:8088/health
- active_contour_root: /opt/processmap-test/.planning/contours/<CID>
- current_git_branch: fix/lockfile-sync-test
- origin_main_head: d805e1c64c1107b9e3fe6854e031694bf741b187

Required Gates:
- Reviewer GSD discipline section present in REVIEW_REPORT.md
- Fresh runtime proof collected (5180/8088)
- Exact user scenario reproduced
- Before/after evidence collected
- User rejection override checked
- No REVIEW_PASS if user-visible scenario still fails
- Product runtime unchanged without scope
```
