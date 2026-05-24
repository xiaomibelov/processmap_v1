# RAG_PREFLIGHT_REVIEWER

Generated at: `2026-05-19T14:43:54Z`
Role: `reviewer`
Contour: `feature/product-actions-registry-frontend-thin-client-switch-v1`

## Структурные факты

- Runtime fact: `frontend_url=http://clearvestnic.ru:5180`.
- Reviewer must verify fresh runtime proof.
- Reviewer must reproduce exact user-facing scenario.
- Reviewer must not approve from stale or incoherent runtime/source state.
- No REVIEW_PASS if runtime does not prove the thin-client migration.

## Использование

RAG использован как read-only checklist source for Agent 4.
