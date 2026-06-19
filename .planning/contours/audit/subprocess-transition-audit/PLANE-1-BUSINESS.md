# Subprocess Transition Architecture — PLANE 1: BUSINESS

## Purpose of subprocesses in ProcessMap

ProcessMap models business processes as hierarchical BPMN diagrams. A `bpmn:SubProcess` or `bpmn:CallActivity` represents a reusable or nested piece of work that deserves its own diagram surface while remaining logically linked to its parent. Subprocesses let users:

- Decompose a complex process into manageable levels without losing the parent context.
- Reuse a process definition (`calledElement`) across multiple call activities.
- Collect discussions, notes, versions, and analysis scoped to a specific subprocess.
- Navigate up and down the hierarchy during modeling, review, and execution playback.

## Core business domains

| Domain | Responsibility | Examples |
|--------|---------------|----------|
| **Workspace / Project** | Ownership, sharing, and discovery | Explorer, dashboard, registry |
| **Session** | A mutable diagram + interview + analysis container | BPMN canvas, interview tabs, versions |
| **Subprocess hierarchy** | Parent/child relationships between sessions | Drilldown, breadcrumbs, return-to-parent |
| **Collaboration** | Notes, discussions, mentions tied to an element/session | Notes panel, discussion threads |
| **Publishing / Registry** | Read-only derived surfaces fed from session truth | Product-actions registry, reports |

## User journeys

### J1 — Drill down from the diagram
Actor: process modeler
1. Open a project session on the BPMN canvas.
2. See a `bpmn:CallActivity` or collapsed `bpmn:SubProcess`.
3. Click the drilldown icon (or context-menu item).
4. System opens the child subprocess session, shows a breadcrumb, and focuses the auto-target element.
5. URL becomes shareable deep-link to the subprocess.

### J2 — Return via breadcrumb
Actor: process modeler
1. Inside a subprocess session, click the parent crumb in the floating breadcrumb.
2. System returns to the parent session and focuses the element that was drilled into.

### J3 — Return via browser Back
Actor: any user
1. Drill down (J1).
2. Press browser Back.
3. System restores the parent session and focus.

### J4 — Open subprocess from a deep-link
Actor: reviewer / collaborator
1. Receive URL with `?project=...&session=<child>&parent=<root>&focus=...`.
2. Open link.
3. System loads the child session and rebuilds the breadcrumb from `navigation_stack`.

### J5 — Copy/paste subprocess subtree
Actor: process modeler
1. Copy a subprocess from one session.
2. Paste into another session.
3. System materializes the subtree as a standalone session fragment, preserving notes and metadata.

## Domain boundaries that must hold

- **A session is a session.** A subprocess session is not a different entity type; it is a session with parent linkage. It has its own lifecycle, versions, discussions, and permissions.
- **Project owns sessions; sessions own hierarchy.** The project is the aggregate root for sharing and quotas; the session is the aggregate root for its own content and navigation stack.
- **BPMN XML is diagram truth, not hierarchy truth.** The hierarchy is derived from `parent_session_id`, `element_id_in_parent`, and `navigation_stack`, not from XML parent/child containment.
- **Deep-link is a first-class artifact.** Any session + focus + parent context must be representable as a URL and restorable on cold load.

## Value at risk

| Failure | Business impact |
|---------|-----------------|
| Back button breaks | Users lose context, cannot review hierarchies efficiently |
| Duplicate child sessions | Clutter, inconsistent breadcrumb, wasted storage, confusion |
| Slow breadcrumbs | Friction in deep hierarchies; perceived performance degradation |
| URL/session mismatch | Broken deep-links, unreliable collaboration handoffs |
| Tight coupling in `App.jsx` / `session_service.py` | Blocks BPMN 123 game mode, reusable canvas adapter, and future headless rendering |

## Invariants to protect

1. `(parent_session_id, element_id_in_parent)` should be unique for a given project (one canonical child per parent element).
2. `navigation_stack` must always be a valid path from root to current session.
3. A deep-link must be reproducible: same URL → same visible session, breadcrumb, and focus.
4. Returning to a parent must restore the element that was drilled into.
