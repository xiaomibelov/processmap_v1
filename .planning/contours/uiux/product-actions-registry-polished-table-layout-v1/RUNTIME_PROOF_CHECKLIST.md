# RUNTIME_PROOF_CHECKLIST

## Source/workspace truth

- [ ] `pwd`
- [ ] remote truth captured without printing secrets
- [ ] `git fetch origin`
- [ ] branch
- [ ] `HEAD`
- [ ] `origin/main`
- [ ] `git status -sb`
- [ ] unstaged diff names
- [ ] staged diff names
- [ ] diffstat for implementation scope

## Five planes

### 1. Code

- [ ] Exact branch/commit containing the UI fix is recorded.
- [ ] Diff is limited to bounded registry UI scope plus version marker if applicable.
- [ ] No backend/schema/BPMN/RAG files changed.

### 2. Workspace

- [ ] Runtime-serving workspace is identified.
- [ ] If worktree was used, path and branch are recorded.
- [ ] Dirty-tree unrelated changes are not mixed into the contour.

### 3. DB / durable data

- [ ] Product Actions durable truth remains `interview.analysis.product_actions[]`.
- [ ] No fake data or fake metrics added.
- [ ] Empty workspace and populated project scopes reflect real data state.

### 4. Env/compose

- [ ] Active runtime environment/compose/server process is identified.
- [ ] Port `5180` is reachable.
- [ ] Runtime build/version info is captured.

### 5. Serving mode

- [ ] Browser receives the intended implementation from `http://clearvestnic.ru:5180`.
- [ ] Cache-busting/fresh context used.
- [ ] Console and network inspected.
- [ ] Viewing/navigation does not emit unsafe `PUT/PATCH/DELETE`.

## Runtime scenarios

- [ ] Open Analytics Hub.
- [ ] Navigate to `Реестр действий`.
- [ ] Validate populated project scope.
- [ ] Validate empty workspace scope.
- [ ] Validate filters no applied values.
- [ ] Validate filters with applied values.
- [ ] Validate AI controls default state.
- [ ] Validate AI controls selected state.
- [ ] Validate warning banner.
- [ ] Validate table rows/status/tags/BPMN code.
- [ ] Validate CSV/XLSX single header placement.
- [ ] Validate sources section secondary placement.
