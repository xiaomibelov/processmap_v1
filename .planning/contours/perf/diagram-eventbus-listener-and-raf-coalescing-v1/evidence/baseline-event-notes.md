# Baseline Event Notes — perf/diagram-eventbus-listener-and-raf-coalescing-v1

**Session:** `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`)
**URL:** http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e
**Date:** 2026-05-15

---

## Baseline (Overlays ON, Default Viewport)

```js
{
  total: 9269,
  djsOverlay: 87,
  fpcPropertyOverlay: 70
}
```

## Scenario B — Pan/Zoom Burst (5 cycles)

```js
{
  total: 9144,
  djsOverlay: 87,
  fpcPropertyOverlay: 70
}
```

- Overlays aligned, counts stable.
- No PUT/PATCH.

## Scenario C — Selection Burst (10 elements)

```js
{
  total: 12334,
  djsOverlay: 87,
  fpcPropertyOverlay: 70
}
```

- Total DOM increase is from selection UI (AI panel, context menus), not overlay duplication.
- No mutations.

## Scenario D — Hover Burst (10 elements)

Same counts as selection burst after settling.

## Scenario E — Tab Return

- Diagram → Analysis → Diagram: overlays reset to 0 (pre-existing: tab switch resets overlay visibility state).
- Re-enabling overlays restores baseline counts.
- No mutations.

## Scenario F — Stress Loop (3 cycles)

| Cycle | Total | djsOverlay | fpcPropertyOverlay |
|-------|-------|------------|-------------------|
| 1 | 9304 | 87 | 70 |
| 2 | 9304 | 87 | 70 |
| 3 | 9304 | 87 | 70 |

- No unbounded growth.
- No increasing lag.

## Network

- `PUT /bpmn`: 0
- `PATCH /sessions`: 0
- `GET /bpmn/versions?limit=1`: ~3 across entire session (background poll, no burst)

## Console

- No new errors related to overlays, decorators, or eventBus.
- Pre-existing 401 on `/api/auth/me`.
- Pre-existing 409 on `/api/sessions/.../bpmn_meta`.
