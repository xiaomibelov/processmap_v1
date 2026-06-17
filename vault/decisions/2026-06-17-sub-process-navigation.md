# Decision: SubProcess Drill-Down Navigation

## Context
Users could not drill down into a BPMN subprocess from the canvas. CallActivity and SubProcess shapes had no visible affordance, and extracted child process XML was missing a valid `<bpmn:definitions>` wrapper, so bpmn-js failed to render it.

## Decision
1. Make CallActivity and SubProcess shapes clickable on the canvas:
   - `bindSubprocessNavigationEvents` registers a high-priority `element.click` handler plus a native DOM click fallback.
   - Adds `cursor: pointer` via `fpc-call-activity-clickable` CSS class.
2. Add a context-menu action **"Перейти в подпроцесс"** for `call_activity` and `subprocess` kinds.
3. Add a **"Перейти в подпроцесс"** button inside `BpmnSubprocessPreviewModal`.
4. Fix backend subprocess extraction:
   - Wrap extracted `<bpmn:process>` / `<bpmn:subProcess>` fragments in a valid `<bpmn:definitions>` document.
   - Register `bpmn`, `bpmndi`, `dc`, `di`, `xsi` prefixes to avoid `ns0` names.
   - Copy the matching BPMNDiagram when available; emit a minimal empty diagram otherwise.
   - Normalize embedded `<bpmn:subProcess>` fragments to `<bpmn:process>` for standalone rendering.
5. Regenerate stale child-session XML on the next navigation if it lacks a `<bpmn:definitions>` wrapper.

## Rationale
- Minimal frontend changes: one binding helper, context-menu extension, modal button, and CSS.
- Native DOM fallback ensures navigation still works when bpmn-js event resolution is unreliable.
- Backend wrapper avoids XML namespace regressions and makes bpmn-js 18.x happy.
- Legacy child session regeneration removes manual migration for pre-fix sessions.

## Verification
- Backend unit tests: 29 passed, 4 warnings.
- Frontend unit tests: 42 passed.
- Frontend build: success.
- Playwright E2E `check_subprocess_click.mjs`: success.
- Deployed to http://clearvestnic.ru:5177 at commit `33890c64`.

## Known issues
- Browsers with stale `refresh_token` cookies may see 401 until cookies/localStorage are cleared.
- Drill-down is only supported for `bpmn:CallActivity` and `bpmn:SubProcess`; flows/associations do not navigate.

## Related contour
- `/root/processmap_v1/.planning/contours/fix/sub-process-navigation/`
