# Decision: BPMN Drill-Down UI Fixes

## Context
Four UI defects remained around BPMN subprocess drill-down after the navigation feature landed:
1. On-canvas breadcrumb overlapped the header/toolbar.
2. Parent diagram gave no indication that a child subprocess had open discussions.
3. No loading state during drill-down / back navigation.
4. No loading state on cold session open.

## Decision
1. **Breadcrumb offset**
   - `.subprocessBreadcrumbsOnCanvas` uses `top: 12px; left: 12px; pointer-events: none`.
   - Inner breadcrumb panel uses `pointer-events: auto`.
2. **Discussion badge on parent diagram**
   - Add `useChildSessionNoteAggregatesByElementId(parentSessionId, sessions)` to map child sessions by `element_id_in_parent`.
   - Pass the aggregate `Map<elementId, aggregate>` through `AppShell → ProcessStage → BpmnStage`.
   - `decorManager.applySubprocessDiscussionDecor` draws a small chat badge on `CallActivity`/`SubProcess` when `open_notes_count > 0`.
3. **Loading state machine**
   - Reuse existing `useDiagramLoadStateMachine` and `DiagramLoadBoundary`.
   - `BpmnStage` calls `loadTransition("reset")` on session change.
   - `bpmnRenderRuntimeLifecycle` signals `import_start`, `import_success`, `import_error`.
   - `DiagramLoadBoundary` renders `DiagramSkeleton` while state is `initializing`/`importing`.
4. **Critical fix for BPMN.js layout init**
   - The canvas must stay visible (`opacity: 1`) under the skeleton; otherwise `ensure_modeler_init` detects a hidden parent and times out with `layout_not_ready_before_modeler_init`.

## Rationale
- Minimal UI-only changes; no backend or XML persistence changes.
- Reuses existing note-aggregate cache/hook for real-time updates and batching.
- Reuses existing load-state machine instead of inventing a new loader.

## Verification
- `npm --prefix frontend run build`: success.
- `node --test frontend/src/lib/sessionNoteAggregates.test.mjs`: 3/3 passed.
- `node scripts/e2e/check_subprocess_click.mjs`: success (self-contained SubProcess drill-down test).
- Deployed to http://clearvestnic.ru:5177 at commit `72288376` (branch `fix/bpmn-drilldown-ui`).

## Known issues
- On very fast loads the skeleton may flash shorter than a frame; the E2E test verifies the `diagram-ready` state marker instead.
- Badge visibility depends on sessions exposing `parent_session_id` and `element_id_in_parent`.

## Related contour
- `/opt/processmap-test/.planning/contours/fix/bpmn-drilldown-ui/`
