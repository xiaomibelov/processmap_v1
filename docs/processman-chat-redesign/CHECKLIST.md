# PROCESSMAN Chat Feed Redesign Checklist

## Visual States

| State | Screenshot |
| --- | --- |
| Empty state + quick actions | [01-empty-quick-actions.png](screenshots/01-empty-quick-actions.png) |
| Two-turn dialog | [02-dialog-two-turns.png](screenshots/02-dialog-two-turns.png) |
| Generating + Stop | [03-generating-stop.png](screenshots/03-generating-stop.png) |
| LLM error + Retry | [04-llm-error-retry.png](screenshots/04-llm-error-retry.png) |
| Suggest-next candidates | [05-suggest-candidates.png](screenshots/05-suggest-candidates.png) |
| Long answer + feed scroll | [06-long-answer-scroll.png](screenshots/06-long-answer-scroll.png) |
| Hover states | [07-hover-states.png](screenshots/07-hover-states.png) |

## Acceptance

| Requirement | Status |
| --- | --- |
| Single PROCESSMAN panel header, no duplicated agent headers per message | PASS |
| Empty agent cards are not rendered before content/pending/error/candidates | PASS |
| User messages are right-aligned bubbles without visible user labels | PASS |
| Agent messages are full-width cards with 22px assistant avatar row | PASS |
| Feedback actions live under agent messages, not in the panel footer | PASS |
| Footer contains only composer and one-line disclaimer | PASS |
| New conversation is a header icon action | PASS |
| Node chips use assistant-soft pills and hover assistant border | PASS |
| Suggest-next candidates render as selectable cards | PASS |
| No assistant purple/pink gradients; flat assistant color is visible in light mode | PASS |
| Motion and hover transitions stay within 150-300ms; reduced motion is respected | PASS |

## Verification

| Check | Result |
| --- | --- |
| `node --test src/features/process/processman/processmanVisualContract.test.mjs src/features/process/processman/processmanView.test.mjs src/styles/pm-tobe-tokens.test.mjs` | PASS |
| `node --test src/features/process/processman/ProcessmanPanel.test.mjs` | PASS |
| `node --test src/features/process/processman/*.test.mjs src/features/process/processman/chat/*.test.mjs src/styles/pm-tobe-tokens.test.mjs` | PASS |
| `npm run build` | PASS |
| Headless screenshots | PASS, 7 states captured |
