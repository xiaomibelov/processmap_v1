# AGENT4_REVIEW_CHECKLIST

Контур: `tooling/registry-analytics-branch-hygiene-and-merge-scope-v1`  
Run ID: `20260517T191023Z-10717`

## Review gate

Agent 4 should approve this branch-hygiene contour only if all items below are satisfied.

## Source/merge scope

- [ ] `pwd`, sanitized remote, branch, `HEAD`, `origin/main`, `status`, tracked diff, staged diff are recorded.
- [ ] Remote output contains no credentials.
- [ ] Every tracked dirty file is classified by Worker 2.
- [ ] Every untracked file/family is classified by Worker 2.
- [ ] Analytics Hub product files are explicitly identified.
- [ ] Registry redesign product files are explicitly identified.
- [ ] Generated/version files are classified as regenerate-or-human-decision, not blindly copied.
- [ ] BPMN/Diagram/runtime leftovers are excluded unless explicitly justified.
- [ ] Tooling/agent/RAG files are excluded from product PR unless there is a separate tooling decision.
- [ ] Screenshots/evidence artifacts are excluded from product PR.
- [ ] `.env*` and secret-adjacent files are excluded and not printed.
- [ ] No destructive cleanup command was used.
- [ ] No merge, push, PR, or deploy was performed.

## Product preservation

- [ ] Analytics Hub exists at `?surface=analytics`.
- [ ] `Реестр действий` is nested inside Analytics Hub.
- [ ] `Реестр свойств`, `Дашборды`, `Экспорт` remain placeholders.
- [ ] Registry works in populated project scope.
- [ ] Empty workspace/project scope keeps the full page/table shell.
- [ ] AI controls appear before the table.
- [ ] `Источники данных` appears after pagination.
- [ ] `Вернуться`/close navigation does not trap the user.
- [ ] Version/build-info proof matches the clean branch under review.
- [ ] Console/network are clean on real runtime paths.

## Required tests/proofs

- [ ] Focused node tests pass:
  `ProductActionsRegistryPanel.test.mjs`, `ProductActionsRegistryPage.test.mjs`, `ProcessAnalyticsHub.test.mjs`.
- [ ] Frontend build passes or host OOM limitation is explicitly documented.
- [ ] Fresh runtime `curl -I` returns `HTTP 200`.
- [ ] Fresh `build-info.json` branch/SHA match reviewed clean branch.
- [ ] Browser runtime check uses a fresh context and exact Analytics -> Registry scenario.

## Block conditions

- [ ] Block if product merge scope includes unclassified frontend/BPMN/Diagram files.
- [ ] Block if generated/evidence files are included as product source without explicit accepted justification.
- [ ] Block if final proof still comes from dirty `fix/lockfile-sync-test` instead of the clean branch intended for merge.
- [ ] Block if canonical root/remote mismatch remains unresolved for final PR/release.

