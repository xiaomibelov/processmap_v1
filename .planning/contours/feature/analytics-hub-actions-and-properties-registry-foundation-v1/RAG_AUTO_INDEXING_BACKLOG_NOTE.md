# Backlog note: RAG auto-indexing

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`

Статус: backlog only. Implementation запрещен в этом контуре.

## Future contour candidates

- Admin RAG auto-indexing control:
  - ручной запуск index/re-index;
  - видимость статуса последней индексации;
  - audit trail без auto-write в продуктовые данные.
- Nightly indexing schedule:
  - отдельный scheduler/worker;
  - bounded source allowlist;
  - clear failure reporting.
- Indexing new Project Atlas files:
  - отслеживание новых/измененных markdown files;
  - дедупликация по path/hash;
  - dry-run mode.
- Detecting unindexed docs:
  - отчет `indexed vs not indexed`;
  - фильтры по workspace/contour/source type.
- Future link/file ingestion:
  - отдельный security model;
  - size/type limits;
  - no automatic mutation of BPMN XML, Product Actions, or project state.

## Explicit non-scope now

- No RAG runtime implementation.
- No auto-indexer.
- No scheduler.
- No link/file ingestion.
- No AI auto-write.
- No product code changes based on RAG output.
