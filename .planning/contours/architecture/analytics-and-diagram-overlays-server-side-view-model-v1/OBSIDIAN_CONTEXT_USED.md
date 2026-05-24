# Obsidian context used

Run ID: `20260519T090224Z-17699`

## Команды

```bash
rg --files /srv/obsidian/project-atlas/ProcessMap
rg -n "EPIC BOARD|ACTIVE TASKS|analytics|Реестр действий|Реестр свойств|Product Actions|Properties Registry|diagram overlay|overlays|bpmn" /srv/obsidian/project-atlas/ProcessMap -g '*.md'
sed -n '1,160p' /srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/EPIC\ BOARD.md
sed -n '1,160p' /srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/ACTIVE\ TASKS.md
```

## Прочитанные notes

| Файл | Релевантность | Решение |
|---|---|---|
| `/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/EPIC BOARD.md` | Canonical Obsidian-first entrypoint. | Зафиксировать, что текущий contour является отдельной architecture planning work unit, не смешивать с активным telemetry work. |
| `/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/ACTIVE TASKS.md` | Active tasks не про analytics migration. | Не присваивать этот contour существующим telemetry/mutation tasks. |
| `/srv/obsidian/project-atlas/ProcessMap/HANDOFF/2026-05-18 - analytics hub actions and properties registry foundation v1 - executor part 2 handoff.md` | Analytics hub/source-truth handoff. | Сохранить product rule: `Аналитика` top-level, `Реестр действий` и `Реестр свойств` как modules; no fake rows. |
| `/srv/obsidian/project-atlas/ProcessMap/HANDOFF/2026-05-18 - process properties registry foundation v1 - executor part 1 handoff.md` | Properties Registry foundation. | Current properties source подтверждён только для session `bpmn_meta.camunda_extensions_by_element_id`; workspace/project backend/API ещё future requirement. |
| `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEXING_POLICY.md` | RAG policy. | RAG auto-indexing/nightly indexing только backlog, не implementation. |
| `/srv/obsidian/project-atlas/ProcessMap/AgentReports/perf/diagram-property-overlays-viewport-culling-v1/PLAN.md` | Overlay performance source. | DOM overlay cost отдельный от backend computation; требуется viewport culling, pan-aware updates, zoom thresholds. |

## Decisions from Obsidian

- Analytics IA не меняется: top-level `Аналитика`, modules `Реестр действий`, `Реестр свойств`, `Дашборды`; `Экспорт` не должен становиться отдельным top-level module.
- Properties Registry must not invent fake data: use confirmed sources only.
- Overlay strategy must avoid mass `.djs-overlay` / `.fpcPropertyOverlay` creation.
- Read-only visualization must not mutate BPMN XML or Product Actions durable truth.
