# ProcessMap Agent — Contour Report

## Contour
- **id**: fix/interview-timeline-performance
- **branch**: `fix/interview-timeline-performance`
- **baseline**: `new-origin/main @ 9e2052db`
- **worktree**: `/opt/processmap-test/.worktrees/fix-interview-timeline-performance`
- **status**: Stage 1 + Stage 4 + Stage 5 complete; Stage 2/3 pending evaluation

## Problem
InterviewStage → TimelineTable rendered at 5–7 FPS with 151 steps:
- BPMN diagram stayed mounted in the background (`opacity-0 pointer-events-none`), keeping ~2454 SVG nodes.
- Virtualization threshold was 200 rows; 151 rows never triggered virtualization.
- `onActivateStep` ran synchronously on mouse/focus, causing frame spikes.

## Changes
### Stage 1.1 — Unmount BPMN during interview
- `frontend/src/components/ProcessStage.jsx`
- Replaced hidden-but-mounted diagram host with conditional render `{!isInterview && <div ... />}`.

### Stage 1.2 — Enable virtualization
- `frontend/src/components/process/interview/TimelineTable.jsx`
- `VIRTUALIZE_ROWS_THRESHOLD` lowered from `200` to `20`.
- Removed `&& !detailsStepId` guard so virtualization stays active when a row is expanded.

### Stage 4 — Deferred step activation
- `frontend/src/components/process/interview/TimelineTable.jsx`
- Wrapped `onActivateStep` calls in `startTransition` via `useTransition`.

### Stage 5 — CSS containment
- `frontend/src/styles/app/03/03-01-interview-core.css`
- Added `contain: layout style paint` to `.interviewTableWrap`.
- Added `content-visibility: auto; contain-intrinsic-size: auto 72px` to `.interviewStepRow`.

## Verification
- `npm run build`: PASS
- Related node tests: 8/8 PASS
  - `src/components/process/InterviewStage.product-actions-placement.test.mjs`
  - `src/components/process/interview/viewmodel/buildTimelineItems.test.mjs`
  - `src/features/process/playback/buildPlaybackTimeline.test.mjs`

## Remaining work
- Stage 2 (TimelineRow memoization) and Stage 3 (draft stabilization) were intentionally deferred to keep the first patch minimal and low-risk. Measure on target dataset to decide if further optimization is needed.

## Notes
- No merge/deploy performed.
- Branch is isolated from `refactor/property-save-decomposition`.
