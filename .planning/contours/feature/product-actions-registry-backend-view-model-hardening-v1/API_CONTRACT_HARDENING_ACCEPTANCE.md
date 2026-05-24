# API_CONTRACT_HARDENING_ACCEPTANCE

Следующий implementation contour считается готовым только если:

- [ ] существующие endpoints `/api/analysis/product-actions/registry/*` сохранены;
- [ ] response остаётся backward-compatible для `rows`, `summary`, `sessions`, `session_summary`, `page`;
- [ ] добавлены или явно запланированы concrete additions:
  - [ ] `filter_options`
  - [ ] `applied_filters`
  - [ ] `metrics` или расширенный `summary`
  - [ ] `empty_state`
  - [ ] `source_state`
- [ ] backend tests доказывают workspace/project/session scope;
- [ ] backend tests доказывают фильтрацию и pagination;
- [ ] backend tests доказывают export/query parity;
- [ ] backend tests доказывают, что heavy payload не возвращается;
- [ ] frontend thin-client plan не требует redesign;
- [ ] durable truth `interview.analysis.product_actions[]` не мутируется;
- [ ] BPMN XML не мутируется;
- [ ] AI suggestions не применяются автоматически;
- [ ] RAG остаётся read-only context layer;
- [ ] `/api/analytics/*` оставлен только как future migration note.

