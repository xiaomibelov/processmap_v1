# Runtime proof checklist

Контур: `uiux/analytics-registry-layout-density-and-visual-system-v1`

## Source/runtime truth

- [ ] `pwd`
- [ ] remote redacted to repo identity
- [ ] `git fetch origin`
- [ ] branch
- [ ] HEAD
- [ ] `origin/main`
- [ ] status
- [ ] unstaged diff names
- [ ] staged diff names

## Five planes

- [ ] `code`: какой commit/branch содержит visual fix.
- [ ] `workspace`: какой checkout/worktree реально served.
- [ ] `DB`: populated project и empty workspace states проверены без fake data.
- [ ] `env/compose`: active runtime/compose stack зафиксирован.
- [ ] `serving mode`: runtime действительно отдает fresh build на `5180`.

## Browser checks

- [ ] Analytics Hub open.
- [ ] Product Actions Registry open.
- [ ] Wide viewport screenshot.
- [ ] Populated project scope screenshot.
- [ ] Empty workspace scope screenshot.
- [ ] Scope selector readable.
- [ ] Metrics useful and compact.
- [ ] Filters/actions primary area.
- [ ] Table dominant.
- [ ] Sources secondary.
- [ ] Console clean.
- [ ] No unsafe `PUT/PATCH/DELETE` during viewing/navigation.

## Non-goal diff check

- [ ] No backend/schema changes.
- [ ] No BPMN XML changes.
- [ ] No RAG runtime changes.
- [ ] No AI behavior changes.
- [ ] No global shell redesign.
- [ ] No package install.

