# Overlay rendering strategy

Run ID: `20260519T090224Z-17699`
Status: `DRAFT_TARGET`

## Core distinction

Backend view-model APIs reduce data preparation cost. They do not automatically reduce browser DOM/SVG/bpmn-js rendering cost.

The overlay performance plan must therefore split two problems:

- server-side computation: prepare small, stable, read-only overlay data;
- frontend rendering: decide what becomes DOM/SVG and when.

## Server-side preparation

The server should return:

- `element_id`;
- `kind`;
- `priority`;
- compact `summary`;
- optional `details`;
- `source_kind`;
- `source_path`;
- `source_version`;
- stable `signature`;
- `read_only: true`.

The server should not return HTML or bpmn-js overlay instructions as canonical truth.

## Frontend rendering rules

- Render only visible or interaction-relevant overlays.
- Apply viewport culling with a buffer.
- Apply zoom thresholds for label/detail density.
- Use hover/selection detail mode.
- Cap initial overlay DOM count.
- Avoid one hidden `.djs-overlay` per non-visible element.
- Avoid full React re-render on every pan when imperative viewport sync is enough.

## Suggested density policy

| Zoom / interaction | Rendering policy |
|---|---|
| low zoom | summary badges only for high-priority visible elements; no long labels. |
| medium zoom | compact labels for visible elements within cap. |
| high zoom | detailed chips for visible elements within cap. |
| hover/selection | render full detail for focused element and nearby context. |

## Mutation boundary

Overlay display is read-only. It must not:

- write BPMN XML;
- write `bpmn_meta`;
- write Product Actions;
- trigger autosave;
- apply AI/RAG suggestions.

## Future proof points

Implementation phases must collect separate evidence for:

- backend response size and latency;
- number of returned overlay view-models;
- number of actual overlay DOM/SVG nodes;
- pan/zoom behavior on large diagrams;
- network proof of no mutation calls during view interactions.

