# Subprocess Transition Architecture — PLANE 2: PROCESS

## Decomposition model

```
Project
└── Session (root process)
    ├── BPMN canvas / interview / analysis / versions
    └── SubProcess / CallActivity element
        └── Child Session (subprocess)
            ├── BPMN canvas / interview / analysis / versions
            └── SubProcess / CallActivity element
                └── Grandchild Session
                    ...
```

A subprocess session is just a `Session` record with:
- `parent_session_id` — immediate ancestor.
- `element_id_in_parent` — the BPMN element that was drilled into.
- `navigation_stack` — ordered frames from root to current session.

## Process flow — happy path drilldown

```
[User clicks drilldown icon]
        │
        ▼
[Frontend: BPMN stage emits drilldownRequested(elementId)]
        │
        ▼
[Frontend: Subprocess transition coordinator]
        │
        ├──► API call POST /sessions/{sid}/subprocess/{elementId}/navigate
        │
        ▼
[Backend: Authz + load parent session]
        │
        ├──► Validate element is subprocess/callActivity
        ├──► Resolve child BPMN XML
        ├──► Find-or-create child session
        ├──► Build targetElementId + breadcrumbs
        └──► Return {subprocess_session_id, target_element_id, breadcrumbs}
        │
        ▼
[Frontend coordinator receives result]
        │
        ├──► Ask session activator to load child session
        ├──► Ask router to push reversible parent→child history entry
        ├──► Pass focusElementId to BPMN stage via props
        └──► Render breadcrumb from response
        │
        ▼
[User sees child session with focused element]
```

## Process flow — browser Back

```
[User presses Back]
        │
        ▼
[Browser pops history entry to parent session URL]
        │
        ▼
[Frontend popstate handler reads URL]
        │
        ├──► If URL session differs from current draft session
        │       └──► Ask session activator to load parent session
        ├──► Ask router to restore focus from URL params
        └──► Render breadcrumb from session.navigation_stack
        │
        ▼
[User sees parent session with the drilled element focused]
```

## Process variants

| Variant | Trigger | Special handling |
|---------|---------|------------------|
| Reuse existing child | Child session already exists for `(parent, element)` | Load existing; repair XML if needed |
| CallActivity with `calledElement` | Element references external process | Resolve by `process_id` match or substring scan |
| Embedded subprocess | Element contains child BPMN inline | Extract via `bpmn_navigation.extract_subprocess_xml` |
| Cold deep-link | User opens child URL directly | Backend rebuilds stack; frontend restores breadcrumb |
| Breadcrumb click | User clicks parent crumb | Frontend calls `apiReturnToParent` and activates parent |
| Copy/paste subprocess | Clipboard across sessions | Materializer creates/merges child subtree in target session |

## Hand-off points

| Hand-off | From | To | Current contract | Desired contract |
|----------|------|----|------------------|------------------|
| H1 — Drilldown intent | BPMN stage / context menu | Transition coordinator | Imperative callback through 3 layers (`bindSubprocessNavigationEvents` → `BpmnStage` → `App.jsx`) | Typed command `{type: 'navigateToSubprocess', elementId}` |
| H2 — Resolve target | Frontend coordinator | Backend `navigate_to_subprocess` | REST POST; response contains child id, target element, breadcrumbs | Same, but backend guarantees idempotent child creation |
| H3 — Activate session | Coordinator | Session activation service | Direct call to `openSession(childId)` | Activation service consumes a transition result and emits `sessionActivated` |
| H4 — Update route | Coordinator | Router/history service | `pushSessionSelectionToUrl` called manually after API | Router listens to activation success and writes history automatically |
| H5 — Render focus | Router / activation | BPMN stage | Global `window.__SUBPROCESS_FOCUS_ELEMENT_ID__` | Explicit prop `{focusElementId}` |
| H6 — Render breadcrumb | Coordinator | UI component | React state `subprocessBreadcrumbs` | Read-only projector fed from `session.navigation_stack` |

## Process state machine (subprocess session lifecycle)

```
                  create
[planned] ─────────────────► [draft]
                                  │
                                  │ import XML / first activation
                                  ▼
[active] ◄────────────────── [opened]
   │                              │
   │ drilldown                    │ return to parent
   ▼                              ▼
[child active]              [parent active]
```

States are not explicit in code today; they are implicit in `(draft?.session_id, URL session, navigation_stack)`. The audit recommends making the transition state machine explicit.

## Process risks

| Risk | Process step | Why it happens |
|------|--------------|----------------|
| Back button drops to project list | H4 | History entry for parent is replaced with `sessionId=""` |
| Duplicate child sessions | H2 | No lock around find-or-create |
| URL points to unloaded session | H3-H4 | URL pushed before activation completes |
| Breadcrumb names missing | H6 | Names loaded independently from `navigation_stack` frames |
| Focus lost after transition | H5 | Global variable may be overwritten or read before render |
