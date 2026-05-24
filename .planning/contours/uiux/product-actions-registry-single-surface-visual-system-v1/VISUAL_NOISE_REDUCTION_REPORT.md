# VISUAL_NOISE_REDUCTION_REPORT

## Removed / reduced

- Gradients removed from registry page/container styling.
- Dotted/dashed registry borders removed.
- Colored metric cards removed.
- Internal card shadows removed.
- Disconnected internal card surfaces reduced to separator-based sections.
- Warning banner converted to compact text row.
- Colored border accents removed from registry sections.
- No stagger animations added.

## Restrained colors

- Purple retained for active scope underline and AI primary CTA.
- Orange retained for incomplete metric/warning and incomplete status badge.
- Green retained only for complete status badge.
- Tags are compact gray chips.
- BPMN code remains subdued in row meta text.

## Source scan

Registry CSS block scan result: no `linear-gradient`, no `gradient`, no `border-style: dashed`. The only matched `box-shadow` in the registry block is the allowed main container shadow: `0 1px 3px rgba(0,0,0,0.06)`.
