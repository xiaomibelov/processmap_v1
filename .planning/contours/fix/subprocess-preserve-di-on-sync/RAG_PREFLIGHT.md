# RAG Preflight — fix/subprocess-preserve-di-on-sync

## Запуск

```bash
cd /Users/mac/agents_place/kimi_PM/server-backup/opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --area "subprocess DI preservation sync bpmn_versions" \
  --query "preserve BPMN DI layout child session sync auto_create_subprocess_sessions bpmn_versions rollback"
```

## Результат

- Запуск 1 (`bash-9ov46vmx`): остановлен как дублирующий.
- Запуск 2 (`bash-uun11yoi`): **timed out** (300s), вывод не получен.

Вместо автоматического RAG прочитаны релевантные заметки вручную.

## Прочитанные источники

1. `server-backup/srv/obsidian/project-atlas/ProcessMap/AgentReports/audit/subprocess-layout-corruption/AUDIT.md`
   - Root cause: `_refresh_child_session_bpmn_from_xml` → `extract_subprocess_xml` → `_generate_di_for_process`.
   - Пострадавшие сессии и координаты v15 для `773ec635cf`.
   - Blast radius: 4 child-сессии в проекте `062bfd212c` с расхождением `sessions.bpmn_xml` vs `bpmn_versions`.

2. `server-backup/srv/obsidian/project-atlas/ProcessMap/Fixes/subprocess-xml-upstream-sync/PR.md`
   - Контур синхронизации child → parent (`re_embed_child_xml_into_parent`).
   - Не относится напрямую к фиксу, но даёт контекст двусторонней sync-логики.

3. `server-backup/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/bpmn-import-subprocess-refresh/WORKER_REPORT.md`
   - Историческая справка по инвалидации подпроцессов после импорта.

## Релевантные skill-контракты

- `processmap-agents` skill: contour type `fix`, artefacts `PLAN.md`, `EXEC_REPORT.md`, `REVIEW_REPORT.md`, `STATE.json`.
- `using-superpowers`, `systematic-debugging`, `test-driven-development`.

## Вывод

Несмотря на timeout автоматического preflight, институциональный контекст для планирования получен: audit-отчёт фиксирует root cause, пострадавшие сессии, эталонные координаты и recommended fix, совпадающие с задачей контура.
