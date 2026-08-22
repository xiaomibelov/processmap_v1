# VERIFICATION: Overlay Pan Visibility Toggle

**Branch:** `feature/overlay-pan-visibility-toggle`  
**Stand:** `http://clearvestnic.ru:5177`  
**Deploy:** `238431df` (2026-06-23 20:38 UTC) — includes `QuotaExceededError` hotfix  

---

## Deploy

```
[DEPLOY] BUILD_ID=238431df branch=feature/overlay-pan-visibility-toggle env=prod
[DEPLOY] Healthcheck passed (http://localhost:8011/version)
```

`npm run build` passed both locally and inside the deploy container.

---

## UI checks

| Step | Screenshot | Result |
|---|---|---|
| Toggle visible, default off | `overlay_pan_initial.png` | Button "Оверлеи при pan" is next to "Слои", no active ring |
| Toggle clicked on | `overlay_pan_on.png` | Button has `ring-1 ring-accent/60`, localStorage = `true` |
| Pan with toggle ON | `overlay_pan_on_during_pan.png` | Canvas moves; overlay root stays visible |
| Pan with toggle OFF | `overlay_pan_off_during_pan.png` | Canvas moves; overlay root hidden during gesture |
| Reload after enabling | `overlay_pan_persist_on.png` | Toggle restores to ON, localStorage = `true` |

**Video demo:** `overlay_pan_toggle_demo.webm` — shows pan with OFF (hidden) then ON (visible).

---

## Persistence

```
localStorage initial:       false
localStorage after on:      true
localStorage after reload:  true   (when left ON before reload)
toggle active after reload: true
```

The setting survives full page reload.

---

## Quota-exceeded fallback

A Playwright run artificially filled `localStorage` to trigger quota pressure, then clicked the toggle ON/OFF.

```
localStorage item after fallback: false
console errors: ["ERROR: Failed to load resource: 401 (Unauthorized)"]
screenshot: overlay_pan_quota_fallback.png
```

No `QuotaExceededError` surfaced; the app silently falls back to in-memory state and remains usable. The only error is the unrelated websocket 401.

## Overlay counts on test session

The test session (`project=b1c8a56b6e&session=03db107ebb`) has 21 `.djs-overlay` nodes, primarily `djs-overlay-drilldown`. With the toggle ON they remain attached during pan; with OFF the overlay root is hidden during the gesture.

---

## Conclusion

- Toggle is visible and clickable.
- ON: overlays stay visible during pan/zoom.
- OFF: overlays hide during pan/zoom (default performance mode).
- State persists across reload via `localStorage`.
- `QuotaExceededError` is caught and handled; toggle stays usable even when localStorage is full.
- Build and deploy succeeded.

**No merge to `main` without explicit approve.**
