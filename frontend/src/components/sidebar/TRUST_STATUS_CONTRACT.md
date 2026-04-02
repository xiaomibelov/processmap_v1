# Sidebar Trust Status Contract

This contract applies only to the completed sidebar trust-status rollout.

## Approved runtime states

- `saved`
- `local`
- `syncing`
- `error`

Future-only states may exist in some surfaces, but are not a generic requirement:

- `offline`
- `attention`

## Runtime ownership

Runtime derivation stays local to each surface.

- Block-level surfaces derive their own state from their own draft/baseline/save boundary.
- Row-level surfaces derive their own state from their own row draft/baseline/save boundary.
- `SidebarTrustStatus` is presentation-only. It must not derive state, compare drafts, own precedence, or become a shared runtime framework.

## Precedence

For the current rollout, precedence is local to each surface but follows the same approved shape where implemented:

- `syncing` > `error` > `local` > `saved`

Node path is intentionally richer and keeps its existing precedence:

- `syncing` > `error` > `attention` > `offline` > `local` > `saved`

## Valid scope

Block-level trust status is valid only when one visible surface has one truthful draft/apply/save contract.

Completed block/subsection surfaces:

- `NodePathSettings`
- `ElementNotesAccordionContent`
- `StepTimeSettings`
- `RobotMetaSettings`
- Camunda extension-state subsection only

Row-level trust status is required when visible rows can be in different states at the same time.

Completed row-level surface:

- `AIQuestionsSection` question rows

## Invalid scope

Do not flatten mixed surfaces into one shared trust-status pill.

Examples:

- `CamundaPropertiesSection` as a whole is invalid because it mixes operation, presentation, dictionary, and extension-state write paths.
- `AIQuestionsSection` as a whole is invalid because different question rows can be `saved`, `local`, `syncing`, or `error` simultaneously.

## UI contract

Trust status should stay calm and compact:

- one pill
- one helper line
- CTA only where already justified
- no banners
- no generic debug surface in production

CTA discipline:

- `error` may show `Повторить`
- `attention` may show `Сверить` where already implemented
- calm states stay passive

## Change rule

When adding or modifying a trust-status surface:

1. define the truthful scope first: block, subsection, or row
2. keep runtime derivation local to that scope
3. reuse `SidebarTrustStatus` only for presentation
4. do not generalize into a global sidebar state system
