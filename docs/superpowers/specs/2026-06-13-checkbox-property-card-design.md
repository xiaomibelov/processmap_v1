# Checkbox-driven property card above BPMN tasks

## Status
Design approved via visual companion (choice: BPMN extension property + card above task + colored keys + hover expand + gap).

## Goal
Let users mark a BPMN element so that up to 5 of its BPMN/custom properties are rendered as a compact card above the task. The existing colored badge stays. More properties are shown on hover.

## User-facing behavior

1. A user opens the element properties panel or BPMN XML and adds the property:
   - Name: `fpc-show-properties`
   - Value: `true` (or `1`, `yes`)
2. When the diagram is rendered with `useBpmnExtensionOverlays` enabled:
   - The element gets its usual colored badge in the top-right corner.
   - If `fpc-show-properties` is truthy, a card is rendered **above** the task.
   - The card shows up to **5 property rows** in a single column.
   - Each property key is colored with the same HSL palette used by badges.
   - If there are more than 5 properties, the last visible row reads `+N more`.
   - Hovering the card expands it to show **all** properties (with vertical scroll if needed).
   - The card width equals the task width and does not exceed it.
   - There is a **gap** (e.g. 6–8 px) between the card bottom and the task top so overlays do not touch the element.

## Data model

The checkbox is stored as a standard BPMN extension property:

```xml
<camunda:property name="fpc-show-properties" value="true" />
<!-- or -->
<zeebe:property name="fpc-show-properties" value="true" />
```

The parser treats it as a **meta-property** (like `fpc-overlay-v2`): it is not shown in the card, but it toggles the card on.

## Parser changes

File: `frontend/src/components/process/utils/bpmnOverlayParser.js`

- Add `isShowPropertiesMetaProperty(name)` helper.
- In `parseOverlayFromProperties`, detect `fpc-show-properties` / `fpc:show-properties` with a truthy value and set `showProperties: true` on the returned overlay object.
- Ensure the meta-property itself is excluded from both the badge count and the property card.

## Rendering changes

File: `frontend/src/components/process/BpmnStage.jsx`

In `mountLightweightOverlays`, for each overlay that has `showProperties === true`:

1. Skip if element width/height is too small for a readable card.
2. Create a card DOM node with class `fpc-overlay-property-card`.
3. Set the card width to the element width in model pixels (`el.width`).
4. Build the card content:
   - Title: overlay text or element name.
   - Visible rows: first 5 real properties (excluding meta-properties).
   - Each row shows `<colored-key>: <value>`.
   - If there are more than 5 rows, render a `+N more` indicator.
   - Hidden rows: all remaining properties, rendered in a separate list that is shown on hover.
5. Mount the card via `overlays.add(el.id, { position: { top: -(cardHeight + gap), left: 0 }, html: card })`.
6. Track the overlay ID in `lightweightOverlayStateRef.current[kind]` so it is cleared on re-render.

The existing badge rendering logic stays unchanged.

## Styling

File: `frontend/src/styles/legacy/legacy_bpmn.css`

Add new scoped classes:

- `.fpc-overlay-property-card`
- `.fpc-overlay-property-card__title`
- `.fpc-overlay-property-card__list`
- `.fpc-overlay-property-card__row`
- `.fpc-overlay-property-card__name`
- `.fpc-overlay-property-card__value`
- `.fpc-overlay-property-card__more`
- `.fpc-overlay-property-card__extra`

Hover rule: `.fpc-overlay-property-card:hover .fpc-overlay-property-card__extra { display: block; }` and hide the `+N more` row.

Colors for property keys come from `overlayPropertyColorByKey(name).accent` applied inline.

## UI checkbox (optional but recommended)

To make the checkbox discoverable, add a toggle in the element properties panel:

- File: `frontend/src/components/sidebar/ElementSettingsControls.jsx` / `CamundaPropertiesSettings`
- Add a labeled checkbox "Показывать свойства над задачей".
- When toggled, add/remove the `fpc-show-properties` property row in the draft.
- Existing save flow persists it into the BPMN XML.

This part can be implemented in the same phase; if time-constrained, the parser-only approach still works when users set the property manually.

## Edge cases

- No real properties: card is not rendered even if checkbox is on.
- Exactly 5 properties: no `+N more` row, hover does not change content.
- Fewer than 5 properties: all rows shown, no expand behavior.
- Very long property names/values: row is truncated with ellipsis.
- Small elements (< some threshold): skip the card to avoid unreadable overlays.
- Zoom/pan: card uses element model width and follows the element through bpmn-js overlay positioning.

## Testing / acceptance criteria

- `npm run build` passes.
- E2E on the test diagram:
  - Adding `fpc-show-properties=true` to an element renders a card above it.
  - Card width does not exceed element width.
  - Card shows up to 5 rows and `+N more` when applicable.
  - Hover expands the card to show all rows.
  - Badge remains visible.
  - Removing the property hides the card.

## Files touched

- `frontend/src/components/process/utils/bpmnOverlayParser.js` (parser)
- `frontend/src/components/process/BpmnStage.jsx` (renderer)
- `frontend/src/styles/legacy/legacy_bpmn.css` (styles)
- `frontend/src/components/sidebar/ElementSettingsControls.jsx` (UI checkbox, optional)
