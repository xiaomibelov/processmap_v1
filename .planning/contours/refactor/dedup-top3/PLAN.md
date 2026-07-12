# PLAN: Dedup Top-3 (P1-2 → P1-1 → P1-3+N1, optional P2-2)

**Contour:** `refactor/dedup-top3` · branch `refactor/dedup-top3` from `origin/main@5aabba98` · PR → approval → merge (no self-merge)
**Source audit:** `/srv/obsidian/project-atlas/ProcessMap/Audits/Duplication-ReReview-2026-07-11.md`
**Approved by user:** 2026-07-11 (order: P1-2 first — live display bug, then P1-1, then P1-3; N1 inside P1-3; N4/P2-2 if smooth)

## Scope (frontend only, no save pipeline, no new deps)

1. **P1-2 normalizeGlobalNotes** — `app/sessionGlobalNotes.js` gains `{ order = "asc" }` + `by` author fallback (superset); `NotesPanel.jsx:650-693` local copy replaced by import with `order: "desc"` (preserves current sidebar order; fixes cross-surface inconsistency).
2. **P1-1 normalizeDocumentationRows** — new `frontend/src/features/process/bpmn/documentation/normalizeDocumentationRows.js` with `{ keepEmpty = false, withId = true }`; canonical superset (NotesPanel id-fallback `|| documentation_${index+1}` wins); 5 consumers migrated: `components/sidebar/ElementSettingsControls.jsx:98`, `components/NotesPanel.jsx:621`, `features/process/bpmn/context-menu/executeBpmnContextMenuAction.js:125`, `.../properties-overlay/buildBpmnPropertiesOverlaySchema.js:18`, `.../properties-overlay/useBpmnPropertiesOverlayController.js:16` (last three with `withId: false`).
3. **P1-3 dead code deletion** — `components/process/analysis/ProductActionsRegistryPanel.jsx`, `ProductActionsRegistryPage.jsx`, `components/process/analysis/registry/` (0 importers; live = `features/analytics/…`) + **N1** `features/process/bpmn/stage/decor/selectionFocusDecor.js` (0 importers; live copies in BpmnStage closure).
4. **P2-2 (optional)** — dedupe-by-signature ×4 → one shared util (`bpmnOverlayParser.js:41`, `v2OverlayContentResolver.js:8`, `propertyDictionaryModel.js:38`, `camundaExtensions.js:51`); canonical name resolution `key ?? name` per-row-family preserved via options.

## Verification (every commit)

- `find src -name "*.test.mjs" -print0 | xargs -0 node --test` → 53=53 vs `/tmp/fails_main.txt` (`comm -13` empty)
- foundation guard `sidebarRedesignFoundation.test.mjs` 10/10
- new pure-node tests for P1-2/P1-1 (and P2-2 if done)
- `npm run build` ✓
- watch out: source-string tests (`NotesPanel.documentation-surface.test.mjs` pattern) — grep before moving functions
- E2E regression on stage after deploy: `process-properties.spec.mjs` + `v2-overlay-persistence.spec.mjs`

## Commits (atomic)

1. P1-2 fix + tests
2. P1-1 shared module + migration + tests
3. P1-3+N1 deletions
4. (optional) P2-2 dedupe util + tests
5. planning STATE
