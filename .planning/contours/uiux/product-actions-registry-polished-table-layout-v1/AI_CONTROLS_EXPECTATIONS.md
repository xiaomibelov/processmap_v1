# AI Controls Expectations

Контур: `uiux/product-actions-registry-polished-table-layout-v1`

## Default state

- `AI-предложения` label is visible in the primary filters/actions area.
- Toggle chips `Все видимые`, `Без действий`, `Неполные` are secondary and do not look like export buttons.
- Primary CTA text is `AI: предложить действия`.
- Counter starts truthfully, for example `Выбрано для AI: 0/10`, based on current visible/eligible rows.
- No AI control is placed inside `Источники данных`.
- Controls are not shown as disabled noise if there is no eligible row; disabled state, if used, must explain eligibility through existing UI patterns without adding fake data.

## Selected state

- When user selection/filtering changes eligible rows, the selected counter updates truthfully.
- Selected count never exceeds hard UI cap shown in the counter.
- CTA remains visually primary, but disabled/enabled state must match actual eligibility.
- Selection must not create or mutate Product Actions rows.
- Checkbox column is acceptable only if existing selection logic supports it safely; otherwise Agent 4 should accept documented non-implementation and reject broken partial selection.

## Visual hierarchy

- AI chips are grouped together and separated from main filters enough to read as an AI-specific mode selector.
- CTA and selected counter are adjacent, not split across distant sections.
- AI controls are visually lighter than the table and warning; they support the workflow, not dominate the page.

## Behavioral boundary

- This contour must not change AI suggestion semantics, prompts, backend contract, durable writes, streaming model, AG-UI integration, or RAG runtime.
- A click on AI CTA may call existing suggestion flow only if the implementation already supports it; Agent 4 should not require new AI behavior for this visual polish contour.
- Viewing/navigating/filtering around AI controls must not send unexpected `PUT`, `PATCH`, or `DELETE`.
