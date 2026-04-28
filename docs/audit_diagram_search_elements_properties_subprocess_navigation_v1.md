# Audit: diagram search elements/properties subprocess navigation v1

## Runtime/source truth

- Audit contour: `audit/diagram-search-elements-properties-subprocess-navigation-v1`.
- Worktree used: `/private/tmp/processmap_audit_diagram_search_elements_properties_subprocess_navigation_v1`.
- Original checkout was dirty and had an unresolved conflict, so this audit used a fresh git worktree from `origin/main`.
- Branch: `audit/diagram-search-elements-properties-subprocess-navigation-v1`.
- HEAD: `ccafb0937099dc9b6f6a412efbf07819bf5fbf76`.
- origin/main: `ccafb0937099dc9b6f6a412efbf07819bf5fbf76`.
- merge-base: `ccafb0937099dc9b6f6a412efbf07819bf5fbf76`.
- App version: `frontend/package.json` declares `foodproc-process-copilot-frontend` version `0.0.0`.
- Local/stage runtime: not started for this audit; no listener was detected on common local app ports `5173/3000/8000/8080/5000`.
- Exact surface: Diagram toolbar button `Поиск`, popover `Поиск на диаграмме`, tabs `Элементы` / `Свойства`, query input, `Найдено`, Prev/Next, result rows.

Bootstrap proof commands:

```text
pwd
/private/tmp/processmap_audit_diagram_search_elements_properties_subprocess_navigation_v1

git branch --show-current
audit/diagram-search-elements-properties-subprocess-navigation-v1

git rev-parse HEAD
ccafb0937099dc9b6f6a412efbf07819bf5fbf76

git rev-parse origin/main
ccafb0937099dc9b6f6a412efbf07819bf5fbf76

git merge-base HEAD origin/main
ccafb0937099dc9b6f6a412efbf07819bf5fbf76

git status -sb
## audit/diagram-search-elements-properties-subprocess-navigation-v1...origin/main
```

## GSD proof

- `gsd`: unavailable (`command not found`).
- `gsd-sdk`: `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`.
- `gsd-sdk --version`: `gsd-sdk v0.1.0`.
- `gsd-sdk query init.phase-op audit/diagram-search-elements-properties-subprocess-navigation-v1`: succeeded, but reported `planning_exists: false`, `roadmap_exists: false`, `phase_found: false`, `agents_installed: false`.
- Limitation: standalone `gsd` is absent in this worktree, so this audit follows GSD discipline manually with `gsd-sdk` proof only.

## Current source map

- Search controller: `frontend/src/features/process/stage/search/useDiagramSearchController.js:27-237`.
- Element search model: `frontend/src/features/process/stage/search/useDiagramSearchModel.js:11-67`, `:69-184`.
- Property search model: `frontend/src/features/process/stage/search/useDiagramPropertySearchModel.js:11-74`, `:77-192`.
- Search popover UI: `frontend/src/features/process/stage/ui/DiagramSearchPopover.jsx:9-168`.
- Toolbar opens search: `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx:547-571`, passes search props at `:876-889`.
- Search controller wiring from ProcessStage: `frontend/src/components/ProcessStage.jsx:6252-6261`.
- Runtime searchable elements/properties: `frontend/src/components/process/BpmnStage.jsx:2130-2222`.
- Runtime search highlights: `frontend/src/components/process/BpmnStage.jsx:2224-2281`.
- Public imperative API for search/focus/select: `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js:626-681`, `:707-738`.
- Ready acknowledgement helper: `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js:492-536`.
- Existing focus implementation: `frontend/src/features/process/bpmn/stage/playbackAdapter.js:892-968`.
- Discussion linked-element focus flow that already composes `whenReady` + `selectElements` + `focusNode`: `frontend/src/components/ProcessStage.jsx:5220-5270`.
- Subprocess context-menu action schema: `frontend/src/features/process/bpmn/context-menu/schema/bpmnContextMenuSchemas.js:72-83`.
- Subprocess open-inside preview action: `frontend/src/features/process/bpmn/context-menu/executeBpmnContextMenuAction.js:1034-1047`.
- Subprocess preview hook: `frontend/src/features/process/stage/hooks/useBpmnSubprocessPreview.js:44-88`.
- Subprocess preview data from `businessObject.flowElements`: `frontend/src/features/process/bpmn/context-menu/executor/buildSubprocessPreview.js:260-290`.
- Existing hierarchy derivation examples: `frontend/src/features/process/playback/buildExecutionGraph.js:31-42`, `:184-192`; `frontend/src/components/process/interview/utils.js:1977-2060`; `frontend/src/features/process/bpmn/stage/template/templatePackAdapter.js:249-325`.

## Space input bug verdict

Verdict: `SEARCH_QUERY_NORMALIZATION_STRIPS_SPACES`.

The search input is in `DiagramSearchPopover.jsx:67-76`. It is a controlled `<input>` whose value is `query`, and its change handler calls `onQueryChange?.(toText(event.target.value))` at `DiagramSearchPopover.jsx:73`. Local `toText` is `String(value || "").trim()` at `DiagramSearchPopover.jsx:5-7`.

That means user input is trimmed before it is written to React state. A trailing space after `foo` becomes `foo` immediately. In a controlled input, this prevents entering multi-word queries naturally: typing `foo`, then space, then `bar` can collapse into `foobar` because the space was removed before the next character.

Search model normalization itself is less suspicious: `normalizeLoose` in both search models trims for matching and collapses whitespace to one space (`useDiagramSearchModel.js:11-12`, `useDiagramPropertySearchModel.js:11-12`). That is appropriate for search comparison, but should not be applied to the controlled input value at every keystroke.

Global/canvas hotkeys found during source audit do not show a direct Space capture for this surface:

- Search popover outside/Escape handler only listens for `Escape`: `useDiagramActionPopovers.js:137-142`.
- `BpmnStage` Ctrl/Cmd+C/V handler ignores editable targets via `isEditableKeyTarget`: `BpmnStage.jsx:120-124`, `:5522-5531`.
- Diagram focus mode only listens for `Escape`: `useDiagramShellState.js:25-32`.

Other capture-phase handlers exist, e.g. template placement listens on `keydown` capture at `useTemplatesStore.js:599-606`, but the audited source hit does not prove Space interception there. Runtime proof can still test this explicitly.

Rejected/secondary verdicts:

- `SEARCH_INPUT_SPACE_CAPTURED_BY_CANVAS_HOTKEY`: not source-proven.
- `SEARCH_INPUT_SPACE_PREVENTED_BY_LOCAL_HANDLER`: not source-proven as `preventDefault`; local handler instead strips the value.
- `UNKNOWN_NEEDS_RUNTIME_PROOF`: not primary; runtime proof is useful, but source already explains the failure mode.

Minimal future fix contour:

- Preserve raw input value in `DiagramSearchPopover` `onChange`; do not trim before `setQuery`.
- Keep normalization inside the search models for matching.
- Add regression coverage that a query containing internal spaces remains in input state and matches multi-word titles/properties.
- Consider adding `onKeyDown/onKeyUp` `stopPropagation` on this input only if runtime later proves canvas/editor shortcuts still receive printable keys. Do not add broad hotkey changes without evidence.

## Elements search model

The `Элементы` tab searches rows returned by `bpmnRef.current.listSearchableElements()` in `useDiagramSearchController.js:43-51`.

The row source is `listSearchableElementsOnInstance` in `BpmnStage.jsx:2136-2184`. It reads `elementRegistry.getAll()`, ignores label elements, allows shapes/connections, requires BPMN type, and builds rows with:

- `elementId`: runtime element id (`BpmnStage.jsx:2157-2172`).
- `name`: `businessObject.name` (`BpmnStage.jsx:2162`).
- `label`: label business object/name/text fallback (`BpmnStage.jsx:2163-2169`).
- `title`: label or name or id (`BpmnStage.jsx:2170-2175`).
- `type` and `typeLabel`: BPMN type (`BpmnStage.jsx:2160`, `:2175-2176`).

The model searches `elementId`, `name`, effective `label`, `type`, `typeLabel`, and `title` by normalized substring include (`useDiagramSearchModel.js:22-67`).

Verdict: current elements search is runtime registry search over the currently loaded diagram instance, not a full XML/model traversal. Internal subprocess children are only included if they appear in the active `elementRegistry.getAll()`; there is no explicit subprocess subtree indexing in the search model.

## Properties search model

The `Свойства` tab searches rows returned by `bpmnRef.current.listSearchableProperties()` in `useDiagramSearchController.js:53-61`.

The row source is `listSearchablePropertiesOnInstance` in `BpmnStage.jsx:2186-2222`. It first reuses `listSearchableElementsOnInstance`, then for each runtime element extracts Camunda/Zeebe property entries from that element's `businessObject` via `extractCamundaZeebePropertyEntriesFromBusinessObject`.

The extractor is intentionally scoped:

- Top-level business object keys starting `camunda:` or `zeebe:` are included (`extractCamundaZeebePropertyEntries.js:20-27`, `:179-188`).
- `extensionElements.values` are recursively walked only once the node is inside a Camunda/Zeebe typed subtree (`extractCamundaZeebePropertyEntries.js:104-171`, `:190-200`).
- Supported scalar/pair fields include value/type/retries/expression/delegateExpression/class/form/process/target/correlation/timer fields (`extractCamundaZeebePropertyEntries.js:39-76`).

The property search model searches only `propertyName` and `propertyValue` (`useDiagramPropertySearchModel.js:41-47`, `:62-74`). It displays element title/id/type as context, but those are not included in property search text.

Verdict: current properties search covers Camunda/Zeebe properties and extension property payloads. It does not search ordinary BPMN documentation, overlays, robot meta unless represented as Camunda/Zeebe extension data, or arbitrary `$attrs` outside the extractor's scope.

## Subprocess hierarchy/grouping feasibility

Verdict: `SUBPROCESS_HIERARCHY_DERIVABLE_CLIENT_SIDE`, with current search rows missing the required fields.

Source-backed facts:

- Current search rows contain no `parentSubprocessId`, breadcrumb, depth, or group key (`BpmnStage.jsx:2170-2177`, `:2205-2215`; search normalizers at `useDiagramSearchModel.js:43-51` and `useDiagramPropertySearchModel.js:49-59` also drop any such data if added upstream unless updated).
- BPMN runtime business objects expose parent chain: `buildExecutionGraph` derives `parentSubprocessId` by walking `businessObject.$parent` until `$type` includes subprocess (`buildExecutionGraph.js:31-42`) and stores it on nodes (`buildExecutionGraph.js:184-192`).
- XML DOM parsing already derives `parentSubprocessId`, `parentSubprocessName`, and `depth` for BPMN flow nodes (`components/process/interview/utils.js:1977-2060`).
- Subprocess subtree traversal through `businessObject.flowElements` is already used for preview and template capture (`buildSubprocessPreview.js:260-290`; `templatePackAdapter.js:249-325`).

Implementation contour can build hierarchy client-side in one frontend pass:

- Index all searchable elements from the active BPMN instance.
- For each element, derive nearest subprocess parent from `businessObject.$parent`; derive full breadcrumb by continuing parent walk.
- For collapsed subprocesses whose internal children are not in `elementRegistry`, traverse subprocess `businessObject.flowElements` recursively and synthesize search rows for children, with `parentSubprocessId`, `subprocessPath`, and `renderedInRegistry=false`.
- Apply the same metadata to property rows.

Backend/API/schema changes are not required for grouping if the active BPMN XML/model is available client-side. A backend change would only be needed if product requirements require searching unloaded external child diagrams or server-side indexing.

## Result click/navigation feasibility

Current state:

- Prev/Next and row click all use `useDiagramSearchController.focusResult` (`useDiagramSearchController.js:79-113`).
- `focusResult` calls `requestDiagramFocus(elementId, { source, clearExistingSelection: true, centerInViewport: true })` (`useDiagramSearchController.js:79-87`).
- Row click exists: `DiagramSearchPopover.jsx:124-150`.
- Highlighting exists: elements mode highlights all matches and the active result; properties mode highlights only the active element (`useDiagramSearchController.js:177-197`).
- Runtime public API exposes `focusNode` and `selectElements` (`bpmnStageImperativeApi.js:667-681`, `:707-738`).
- A proven ready/focus pattern exists for discussions: `whenReady`, then `selectElements`, then `focusNode` with `centerInViewport` (`ProcessStage.jsx:5220-5270`).

Verdicts:

- `RESULT_CLICK_FOCUS_EXISTS`: yes for ordinary elements present in the current runtime registry.
- `RESULT_CLICK_FOCUS_MISSING`: no for current visible/registry elements; yes for synthesized subprocess-internal children that are not in registry until the model/view is opened or rendered.
- `SUBPROCESS_OPEN_FOCUS_HELPER_EXISTS`: partial. There is an `open_inside` context-menu action, but it returns `openInsidePreview`, not a drill-down canvas/model switch (`executeBpmnContextMenuAction.js:1034-1047`). `useBpmnSubprocessPreview` consumes that preview and can open properties for the subprocess itself (`useBpmnSubprocessPreview.js:44-88`).
- `SUBPROCESS_OPEN_FOCUS_MISSING`: yes for the desired "open subprocess and focus child element/property inside it" behavior. Existing code previews a subprocess; it does not expose a direct helper like `openSubprocessAndFocus(childId)`.
- `FOCUS_AFTER_SUBPROCESS_OPEN_NEEDS_READY_ACK`: yes. The existing discussion focus flow shows this should wait for `bpmnRef.current.whenReady()` before selecting/focusing (`ProcessStage.jsx:5220-5228`).

Likely race conditions:

- Search result built from stale registry after diagram mutation/reload.
- Subprocess open/preview state updates before canvas/model is ready.
- Child element id not present in current `elementRegistry` for collapsed or preview-only subprocess internals.
- Properties rows may point at an element that exists semantically in `flowElements` but has no rendered DI/shape in the current instance.
- Active search highlight can clear/reapply while the mode/query changes during navigation.

## UI/UX problem map

Current UI is functional but low-hierarchy:

- Tabs are just two secondary buttons with ring state (`DiagramSearchPopover.jsx:48-65`); they do not read as a compact segmented control.
- Input has a generic `Запрос` label and English placeholders (`property name / property value`, `id / name / label / type`) at `DiagramSearchPopover.jsx:28-33`, `:67-76`.
- Count and active index are separate simple chips (`DiagramSearchPopover.jsx:79-84`), with no mode-specific breakdown.
- Prev/Next are English labels and detached from the active result context (`DiagramSearchPopover.jsx:86-105`).
- Empty states are terse and implementation-oriented (`Введите текст для поиска по property.name/property.value`, `id/name/label/type`) at `DiagramSearchPopover.jsx:31-33`, `:107-112`.
- Result list is flat, capped at 240 rows, and has no grouping, breadcrumb, or subprocess containment marker (`DiagramSearchPopover.jsx:113-162`).
- Property rows display property name/value and element context, but do not show source category or hierarchy beyond `sourcePath` being hidden in the title/data (`DiagramSearchPopover.jsx:117-139`).

Design contract for future UI, no code in this contour:

- Use a compact segmented control for `Элементы` / `Свойства`.
- Keep the input value raw and visually stable; use Russian placeholder copy.
- Replace bare `Найдено` with count summary: total + active index + grouped counts by main process/subprocess.
- Show grouped sections:
  - `Основной процесс`
  - `Subprocess: <name>`
  - nested subprocess breadcrumb if depth > 1.
- Within each group, separate `Элементы` and `Свойства` counts or badges.
- Rows should show title, type/property chip, id, and breadcrumb/path. Property rows should show property name/value plus owning element.
- Empty state should distinguish "start typing", "no matches", and "matches exist only inside collapsed subprocess and require open/focus flow" if applicable.
- Prev/Next should remain, but their labels should be localized and attached to active result state.

## Recommended implementation contours

### `fix/diagram-search-input-space-handling-v1`

Goal: allow multi-word search queries in Diagram search without changing search semantics.

Likely changes:

- `frontend/src/features/process/stage/ui/DiagramSearchPopover.jsx`: pass `event.target.value` raw to `onQueryChange`.
- `frontend/src/features/process/stage/search/useDiagramSearchModel.js`: keep `normalizeLoose` for matching; add coverage for internal spaces.
- `frontend/src/features/process/stage/search/useDiagramPropertySearchModel.js`: same coverage for property values/names.
- Tests in/near `frontend/src/features/process/stage/search/useDiagramSearchController.test.mjs` or a focused UI test for `DiagramSearchPopover`.

Validation:

- Search input retains `"проверить заказ"` while typing.
- Elements search matches multi-word element name/label.
- Properties search matches multi-word property value.
- Runtime keydown probe confirms Space is not prevented by canvas/global hotkeys while focus is in the search input.

### `uiux/diagram-search-results-grouped-by-subprocess-v1`

Goal: source-backed grouped result model and better popover presentation.

Likely changes:

- `frontend/src/components/process/BpmnStage.jsx`: enrich `listSearchableElementsOnInstance` and `listSearchablePropertiesOnInstance` rows with parent subprocess metadata or expose a separate hierarchy builder.
- `frontend/src/features/process/stage/search/useDiagramSearchModel.js`: preserve hierarchy fields through normalization.
- `frontend/src/features/process/stage/search/useDiagramPropertySearchModel.js`: preserve hierarchy/source fields through normalization.
- `frontend/src/features/process/stage/ui/DiagramSearchPopover.jsx`: render grouped sections, localized copy, richer row metadata.
- Optional shared utility: new search hierarchy helper under `frontend/src/features/process/stage/search/`.

Validation:

- Main-process elements group under `Основной процесс`.
- Expanded subprocess children group under their subprocess.
- Nested subprocess children include breadcrumb/depth.
- Property rows group under owning element's subprocess.
- Flat behavior remains usable for diagrams without subprocesses.

### `fix/diagram-search-result-click-focus-subprocess-v1`

Goal: clicking or stepping to a result focuses ordinary elements and can navigate to subprocess-contained results.

Likely changes:

- `frontend/src/features/process/stage/search/useDiagramSearchController.js`: route result selection through an async navigation/focus callback instead of only `requestDiagramFocus(elementId)`.
- `frontend/src/components/ProcessStage.jsx`: add/search-specific focus orchestration using existing `whenReady`, `selectElements`, `focusNode` pattern.
- `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js`: expose a subprocess open/focus helper only if runtime needs a public imperative boundary.
- `frontend/src/features/process/bpmn/context-menu/executeBpmnContextMenuAction.js` or subprocess preview code: reuse `open_inside` only if "preview" is the desired UX; otherwise add a distinct "open/navigate into subprocess" runtime action to avoid overloading preview behavior.

Validation:

- Click ordinary result selects/focuses.
- Prev/Next ordinary result selects/focuses.
- Click subprocess-child result opens required subprocess context, waits for ready ack, selects/focuses child.
- Missing child id yields clear no-op/error state, not stale focus.
- Repeated fast Prev/Next does not focus stale session/model.

## Exact files likely to change later

- `frontend/src/features/process/stage/ui/DiagramSearchPopover.jsx`
- `frontend/src/features/process/stage/search/useDiagramSearchController.js`
- `frontend/src/features/process/stage/search/useDiagramSearchModel.js`
- `frontend/src/features/process/stage/search/useDiagramPropertySearchModel.js`
- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js`
- `frontend/src/features/process/bpmn/context-menu/executeBpmnContextMenuAction.js`
- `frontend/src/features/process/stage/hooks/useBpmnSubprocessPreview.js`
- Tests under `frontend/src/features/process/stage/search/`, `frontend/src/features/process/bpmn/stage/imperative/`, and possibly `frontend/src/features/process/stage/hooks/`.

## Risks / open questions

- Runtime proof is still needed to confirm there is no additional Space interception after the local `trim()` fix.
- Need product decision: "open subprocess" currently means preview modal, not a true child-diagram/canvas navigation. The implementation contour must define whether search should open preview, expand/canvas-focus, or switch to a separate child diagram surface.
- Need verify bpmn-js behavior for collapsed subprocess internals in this app: if children have no rendered DI in `elementRegistry`, focus requires either opening/rendering a child surface or focusing the subprocess container with a child-row context.
- Property search currently excludes documentation and arbitrary robot meta. If users expect those, that is a separate search-scope decision, not just UI grouping.
- Search rows capped at 240 in UI; large diagrams may need virtualized or grouped rendering before raising this.

## Validation plan for future implementation

- Unit: input state preserves spaces; model normalization still collapses whitespace for matching.
- Unit: hierarchy builder returns `parentSubprocessId`, `subprocessPath`, `depth`, and main-process group for elements and properties.
- Unit: property search preserves source metadata and hierarchy fields.
- Integration/jsdom: `useDiagramSearchController` selects ordinary and subprocess-contained rows through the expected navigation callback.
- Runtime/Playwright: open Diagram toolbar search popover, type a multi-word query with spaces, assert input value and result rows.
- Runtime/Playwright: search inside a large process with subprocesses, assert grouping labels and row counts.
- Runtime/Playwright: click ordinary result and subprocess-child result; assert selection/focus markers and no stale focus after fast Prev/Next.

## Audit-only validation

Before commit, run:

```bash
git diff --check
git diff --cached --check
git status -sb
```

No build is required for this audit because product code was not changed.
