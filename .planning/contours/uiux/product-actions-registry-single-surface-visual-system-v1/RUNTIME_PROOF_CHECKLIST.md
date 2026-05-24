# RUNTIME_PROOF_CHECKLIST

## Runtime access

- [ ] Open fresh browser context.
- [ ] Visit `http://clearvestnic.ru:5180`.
- [ ] Navigate to `Реестр действий с продуктом`.
- [ ] Confirm page is not Analytics Hub.

## Source/runtime truth

- [ ] `pwd` captured.
- [ ] Remote captured without credential leakage.
- [ ] `git fetch origin` completed.
- [ ] Branch captured.
- [ ] `HEAD` captured.
- [ ] `origin/main` captured.
- [ ] `git status -sb` captured.
- [ ] `git diff --name-only` captured.
- [ ] `git diff --cached --name-only` captured.
- [ ] `/build-info.json` captured from `:5180`.
- [ ] `intended == served` proven.

## 5 planes

- [ ] Code plane: branch/commit containing fix.
- [ ] Workspace plane: checkout/worktree used for build.
- [ ] DB plane: durable Product Actions data state after scenario.
- [ ] Env/compose plane: active runtime stack.
- [ ] Serving mode plane: gateway/nginx/static dist actually serves intended build.

## Visual review

- [ ] One unified white container.
- [ ] Header hierarchy matches spec.
- [ ] Scope selector compact tabs.
- [ ] Metrics text-only.
- [ ] Filters compact row.
- [ ] AI row non-banner, no gradient.
- [ ] Warning row soft, no filled yellow banner.
- [ ] Table is main object.
- [ ] Status badges only strong colors.
- [ ] CSV/XLSX only once in header.
- [ ] Empty state has no fake data.
- [ ] Populated state uses real data.

## Safety

- [ ] No console errors.
- [ ] No unsafe `PUT/PATCH/DELETE` from viewing/navigation unless explicitly allowlisted.
- [ ] No backend/schema/BPMN/RAG changes.
- [ ] No Product Actions durable truth mutation from viewing.

