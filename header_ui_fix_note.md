# Header UI Fix Note

## Implemented
1. Status at top header uses canonical session status
- `frontend/src/App.jsx` now passes:
  - `sessionStatus={resolveSessionStatusFromDraft(draft, "draft")}`
- `resolveSessionStatusFromDraft` prefers `draft.interview.status` and normalizes aliases.

2. Removed created-by metadata from top header blocks
- `frontend/src/components/TopBar.jsx`
- Project/session labels no longer include `Created by` / `Updated by` fragments.

3. Header block composition
- Top metadata blocks now focus on:
  - Project
  - Session
  - Org

4. Positioning adjustment
- In `TopBar`, center metadata container changed from `justify-center` to `justify-end` to move project/session blocks toward org area on the right side.

5. Outside-session revision badges
- `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx`
- `No published revision` / `Unpublished` badges are now rendered only when `hasSession === true`.
