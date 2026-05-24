# RUNTIME_PROOF_CHECKLIST

Alias of `API_RUNTIME_CHECKLIST.md` for compatibility with existing agent status tooling.

## Required Runtime Proof

- Fresh `http://clearvestnic.ru:5180` proof.
- Served build/runtime matches intended contour.
- Endpoint namespace remains `/api/analysis/product-actions/registry/*`.
- Product Actions Registry uses backend view-model fields where available.
- UI still renders Analytics, `Реестр действий`, populated project scope, empty workspace scope, filters, metrics, sources, exports, and AI controls.
- No console errors.
- No unsafe `PUT`/`PATCH`/`DELETE` from viewing/navigation.
