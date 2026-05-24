# Runtime Proof Checklist — tooling/processmap-agents-4-agent-workflow-migration-v1

## Scope
Этот контур — tooling/workflow миграция. Product runtime (:5180 / :8088) не затрагивается.

## Чек-лист проверок

### Перед началом работы (Agent 1)
- [x] GSD доступен: `/opt/processmap-test/bin/gsd`
- [x] GSD tools: `/root/.codex/get-shit-done/bin/gsd-tools.cjs`
- [x] GSD skills: 48 штук в `/root/.codex/skills/`
- [x] RAG preflight planner выполнен
- [x] RAG preflight reviewer выполнен
- [x] Source truth сервера зафиксирован
- [x] Локальный Mac недоступен — создан LOCAL_MAC_CHECKLIST.md

### После Worker 2 (локальный Mac)
- [ ] Локальные скрипты проверены `bash -n`
- [ ] Dry-run показывает 4 агента
- [ ] CID валидируется
- [ ] Split mode [1] поддерживает 4 агентов
- [ ] 3-window/fallback mode поддерживает 4 агентов или явно переименован в 4-window
- [ ] tmux kill остаётся opt-in
- [ ] Резервные копии созданы перед правками
- [ ] WORKER_2_DONE существует
- [ ] WORKER_2_REPORT.md написан

### После Worker 3 (сервер)
- [ ] Серверные скрипты проверены `bash -n`
- [ ] `pm-agent-status.sh` показывает 4-agent state
- [ ] `pm-agent4-reviewer-watch.sh` существует и работает
- [ ] `pm-agent-reset-stale.sh` обрабатывает новые маркеры
- [ ] `pm-agents-server-tmux.sh` запускает 4 агента
- [ ] `install-processmap-agent-scripts.sh` создаёт 4-agent структуру
- [ ] `pm-agent-mirror-report.sh` знает о новых маркерах
- [ ] Резервные копии созданы перед правками
- [ ] WORKER_3_DONE существует
- [ ] WORKER_3_REPORT.md написан

### Agent 4 Reviewer
- [ ] Оба WORKER_2_DONE и WORKER_3_DONE существуют
- [ ] Оба worker-отчёта прочитаны
- [ ] Независимая инспекция изменённых файлов выполнена
- [ ] `bash -n` пройден для всех скриптов
- [ ] Dry-run подтверждает 4 агента
- [ ] CID propagation проверена
- [ ] Маркерная модель проверена
- [ ] Status output проверен
- [ ] Product runtime файлы НЕ изменены
- [ ] Секреты НЕ напечатаны
- [ ] REVIEW_REPORT.md написан
- [ ] REVIEW_PASS или CHANGES_REQUESTED создан
