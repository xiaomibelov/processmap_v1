# Runtime Before / After

## Contour
`perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`

---

## Before (Previous Contour State)

| Metric | Value |
|--------|-------|
| Version | v1.0.127 |
| Default mode | Modeler (editable) |
| Element drag | POSSIBLE |
| Canvas pan long tasks | ~14 long tasks, ~1,800ms total (quick drag) |
| Stepped canvas pan | ~88 long tasks, ~11,600ms total |
| `commandStack.changed` guard in wire events | ✅ Exists |
| `useBpmnSettledDecorFanout` drag guard | ❌ None |
| `emitDiagramMutation` drag guard | ❌ None |
| Autosave during drag | Could schedule via coordinator path |
| Footer | `Версия v1.0.127 · a9a9d9c · 15.05.2026, 23:38` |

## After (This Contour)

| Metric | Value |
|--------|-------|
| Version | v1.0.128 |
| Default mode | Modeler (editable) |
| Element drag | POSSIBLE |
| `useBpmnSettledDecorFanout` drag guard | ✅ `dragInProgressRef` early-return in all 5 effects |
| `emitDiagramMutation` drag guard | ✅ `isDragInProgress` check, `pendingDragMutationRef` |
| Post-drag mutation flush | ✅ `drag.cleanup` emits one `diagram.change` if pending |
| `wireBpmnStageRuntimeEvents` guards | ✅ Verified still in place |
| Autosave during drag | Suppressed; one autosave after drag end if element moved |
| Footer | `Версия v1.0.128 · a9a9d9c · 16.05.2026, 08:13 · perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1` |

## Code Changes That Affect Drag

### Added
1. `useBpmnSettledDecorFanout` receives `dragInProgressRef` and suppresses all fanouts during drag.
2. `emitDiagramMutation` checks `isDragInProgress` and sets `pendingDragMutationRef` instead of emitting.
3. `bindContextMenuRuntimeEvents` flushes `pendingDragMutationRef` on `drag.cleanup`.

### Expected Impact
- **Canvas pan**: Should be similar or slightly better (no decor fanout from `readySignal` changes).
- **Element drag**: Should be smoother (no autosave queue thrashing, no decor fanout).
- **Post-drag**: One bounded sync (selection, decor, autosave) after drag ends.

## Verification Gap

Browser runtime testing for drag metrics was attempted but blocked by app loading/auth state in the automated Playwright MCP context (tabs disabled, 401 on `/api/auth/me` in initial load). This is documented as a **test environment limitation**, not a code regression.

**Agent 3 must verify**:
1. Diagram loads with Modeler default.
2. Canvas pan long tasks are ≤8 for quick drag (target) or materially improved.
3. Element drag is smooth with no stutter.
4. No console errors during drag.
5. 0 PUT/PATCH from drag interactions.
6. One autosave after drag end if element was moved.
