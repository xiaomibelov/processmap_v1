# RUNTIME_PROOF_CHECKLIST — Чек-лист proof для reviewer

## Контур
`tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1`

## Agent 4 / Reviewer Gates

### GSD Discipline
- [ ] Reviewer GSD discipline recorded
- [ ] All Agent 2 reports read
- [ ] All Agent 3 reports read
- [ ] Changed files inspected independently
- [ ] Validation commands run independently

### Local Launcher (Agent 2 scope)
- [ ] `bash -n "$HOME/Desktop/ProcessMap Agents.command"` — PASS или documented limitation
- [ ] `bash -n "$HOME/bin/processmap-iterm-agents.sh"` — PASS или documented limitation
- [ ] `bash -n "$HOME/bin/processmap-iterm-agents-3windows.sh"` — PASS или documented limitation
- [ ] `bash -n "$HOME/bin/processmap-agent-pane.sh"` — PASS или documented limitation
- [ ] Split mode [1] запускает 4 pane — proven или documented limitation
- [ ] Fallback mode запускает 4 контекста — proven или documented limitation
- [ ] Dry-run печатает 4 команды с одинаковым CID — proven или documented limitation
- [ ] CID validation сохранена — proven
- [ ] Invalid CID отклоняется — proven или documented limitation
- [ ] Invalid mode отклоняется — proven или documented limitation
- [ ] tmux kill opt-in — proven или documented limitation

### Server Compatibility (Agent 3 scope)
- [ ] `bash -n tools/pm-agent1-planner.sh` — PASS
- [ ] `bash -n tools/pm-agent2-executor-watch.sh` — PASS
- [ ] `bash -n tools/pm-agent3-reviewer-watch.sh` — PASS
- [ ] `bash -n tools/pm-agent4-reviewer-watch.sh` — PASS
- [ ] `bash -n tools/pm-agent-status.sh` — PASS
- [ ] `bash -n tools/pm-agent-reset-stale.sh` — PASS
- [ ] `bash -n tools/pm-agents-server-tmux.sh` — PASS
- [ ] `pm-agent-status.sh` показывает 4-agent state — PASS
- [ ] Agent 4 reviewer script существует и ждёт WORKER_2_DONE + WORKER_3_DONE — PASS
- [ ] Script name contract совпадает с локальными ожиданиями — PASS

### CID Propagation
- [ ] Agent 1 command содержит CID
- [ ] Agent 2 command содержит тот же CID
- [ ] Agent 3 command содержит тот же CID
- [ ] Agent 4 command содержит тот же CID
- [ ] Regex `^[A-Za-z0-9_./-]+$` используется во всех скриптах

### Product Runtime
- [ ] Нет изменений в `frontend/src/`
- [ ] Нет изменений в `backend/app/`
- [ ] Нет изменений в `.env`
- [ ] Нет изменений в package файлах

### Secrets
- [ ] Нет паролей, токенов, API keys, private keys в отчётах

### Documentation
- [ ] REVIEW_REPORT.md на русском
- [ ] Agent prompts на английском
- [ ] Backups задокументированы (или не требовались)

### Verdict
- [ ] REVIEW_PASS или CHANGES_REQUESTED создан
- [ ] Если FAIL: REWORK_REQUEST.md создан с exact changes
