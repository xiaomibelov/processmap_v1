# RAG backlog notes

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`

## Решение

RAG auto-indexing/nightly indexing/link ingestion не входят в implementation этого контура.

## Backlog-only идеи

- Admin RAG auto-indexing.
- Nightly indexing schedule.
- Indexing new Project Atlas files.
- Detecting unindexed docs.
- Future link/file ingestion.

## Запрещено в этом контуре

- Не реализовывать scheduler.
- Не добавлять RAG runtime API.
- Не добавлять RAG admin UI.
- Не менять ingestion/indexer tooling.
- Не запускать auto-indexing как delivery step.

## Основание

RAG preflight и Project Atlas RAG policy подтверждают: RAG является read-only suggestion/context layer и не должен auto-mutate code, files, BPMN XML или Product Actions.
