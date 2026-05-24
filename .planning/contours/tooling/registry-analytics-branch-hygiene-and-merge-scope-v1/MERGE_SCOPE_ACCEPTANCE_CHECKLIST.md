# MERGE_SCOPE_ACCEPTANCE_CHECKLIST

## Обязательные условия

- [ ] Все tracked dirty файлы перечислены.
- [ ] Все untracked файлы или безопасно bounded директории перечислены.
- [ ] Каждый item классифицирован в одну из категорий A-G.
- [ ] `A. KEEP_ANALYTICS_HUB` содержит только файлы, нужные для Analytics Hub/navigation/surface/tests/styles/version rows.
- [ ] `B. KEEP_REGISTRY_REDESIGN` содержит только файлы, нужные для Registry redesign/tests/styles.
- [ ] `C. KEEP_VERSION_RUNTIME_PROOF` содержит только version/build-info/runtime marker files, реально нужные для accepted proof.
- [ ] `D. TOOLING_AGENT_INFRA` исключён из product PR, если нет отдельного решения.
- [ ] `E. EVIDENCE_ONLY` исключён из product PR, кроме accepted planning/docs paths.
- [ ] `F. UNRELATED_OR_UNSAFE` исключён из merge scope.
- [ ] `G. NEEDS_HUMAN_DECISION` не попадает в merge scope без решения пользователя.
- [ ] Backend/schema changes не включены.
- [ ] BPMN XML changes не включены.
- [ ] RAG runtime changes не включены.
- [ ] Diagram performance leftovers не включены.
- [ ] `.env` и secret-like files не читаются и не печатаются.
- [ ] Clean branch/worktree strategy стартует от свежего `origin/main`.
- [ ] No destructive git commands were run.
- [ ] No merge/PR/deploy/push was performed.
- [ ] Tests/runtime checks to rerun after isolation listed.

## REVIEW_PASS threshold

Agent 4 выдаёт `REVIEW_PASS` только если все обязательные условия выполнены или blocked items явно оформлены как `G. NEEDS_HUMAN_DECISION` и исключены из merge scope.
