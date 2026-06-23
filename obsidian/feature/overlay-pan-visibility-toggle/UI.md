# UI: Overlay Pan Visibility Toggle

## Placement

The toggle is a button in the main diagram toolbar, immediately to the right of the **Слои** button.

## Appearance

- Default (off): `secondaryBtn diagramActionBtn`.
- Active (on): same base classes + `ring-1 ring-accent/60`.
- Icon: eye SVG (16×16, stroke currentColor).
- Label: "Оверлеи при pan".
- `data-testid="diagram-action-overlay-pan-toggle"`.

## Interaction

- Click toggles `showOverlaysDuringPan`.
- Tooltip/title explains current mode:
  - On: "Оверлеи остаются видимыми при перемещении/зуме"
  - Off: "Скрывать оверлеи при перемещении/зуме для производительности"
- Disabled when not on the BPMN tab (`!isBpmnTab`).

## Accessibility

- `<button type="button">`.
- Icon has `aria-hidden="true"`; label text provides accessible name.
