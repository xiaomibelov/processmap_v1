# Runtime Proof Checklist Filled

Контур: `uiux/analytics-registry-layout-density-and-visual-system-v1`  
Run ID: `20260518T085529Z-44650`  
Статус: `BLOCKED`

## Source/runtime truth

- [x] `pwd`: `/opt/processmap-test`
- [x] remote redacted to repo identity: `github.com/xiaomibelov/processmap_v1.git`
- [x] `git fetch origin`: success
- [x] branch: `fix/lockfile-sync-test`
- [x] HEAD: `5b20bc2d1292f419647238eaf37dac55f9315942`
- [x] `origin/main`: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- [x] status: dirty launcher checkout
- [x] unstaged diff names: recorded by command output; launcher diff not treated as reviewed implementation truth
- [x] staged diff names: empty

## Five planes

- [x] `code`: intended visual fix commit `8d41fa92bdb3bdd4418d98f43ec8b9387e1a90d7` on branch `uiux/analytics-registry-layout-density-and-visual-system-v1-agent2`.
- [x] `workspace`: implementation worktree `/opt/processmap-test-agent2-uiux-layout`; launcher `/opt/processmap-test`.
- [ ] `DB`: blocked before browser scenario validation.
- [x] `env/compose`: gateway container `processmap_test-gateway-1`, port `0.0.0.0:5180->80/tcp`.
- [ ] `serving mode`: FAIL. Runtime serves different contour `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1` from `/opt/processmap-test-agent2-uiux`.

## Browser checks

- [ ] Analytics Hub open: not reviewed because runtime identity failed.
- [ ] Product Actions Registry open: not reviewed because runtime identity failed.
- [ ] Wide viewport screenshot: not captured for verdict because served build is wrong.
- [ ] Populated project scope screenshot: not captured for verdict because served build is wrong.
- [ ] Empty workspace scope screenshot: not captured for verdict because served build is wrong.
- [ ] Scope selector readable: blocked.
- [ ] Metrics useful and compact: blocked.
- [ ] Filters/actions primary area: blocked.
- [ ] Table dominant: blocked.
- [ ] Sources secondary: blocked.
- [ ] Console clean: blocked.
- [ ] No unsafe `PUT/PATCH/DELETE` during viewing/navigation: blocked.

## Non-goal diff check

Implementation branch diff scan:

- [x] No backend/schema changes detected.
- [x] No BPMN XML changes detected.
- [x] No RAG runtime changes detected.
- [x] No AI behavior changes detected by path scope.
- [x] No global shell/header/sidebar redesign files detected in implementation branch diff.
- [x] No package install/lockfile changes detected.

Runtime identity still blocks final review.
