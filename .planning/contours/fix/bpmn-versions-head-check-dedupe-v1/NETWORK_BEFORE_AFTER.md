# Network Before / After

## Method
- Runtime: `http://clearvestnic.ru:5180`
- Session: `wewe` (session ID `4c515d1c6e`)
- Instrumentation: `window.fetch` intercept in Playwright, filtering `url.includes('/bpmn/versions')`

## Before Fix (old code, baseline)

| Scenario | Duration | `limit=1` requests | Notes |
|---|---|---|---|
| A — Diagram idle | 30 s | **5** | Requests every ~9 s from `pollRemoteSessionSnapshot` |
| B — Overlays + pan/zoom | 10 s | **0** (within same window) | No additional calls observed during overlay interaction |
| C — Tab switch | full cycle | **Not isolated** | Old code had `draft?.bpmn_xml_version` in useEffect B deps, so tab switches could trigger extra calls |

## After Fix (new code)

| Scenario | Duration | `limit=1` requests | Notes |
|---|---|---|---|
| A — Diagram idle (first 30 s) | 30 s | **1** | Only the initial load call; subsequent polls blocked by 30 s cooldown |
| A — Diagram idle (extended) | ~120 s | **3–4** | ~1 call every 30–36 s as polls slip through after cooldown expires |
| B — Overlays + pan/zoom | ~13 s | **0 additional** | Overlay toggle and wheel events did not trigger versions calls |
| C — Tab switch | full cycle | **0 additional** | Diagram → Analysis → XML → Diagram produced no new `limit=1` calls |

## Key Improvement
- **Before**: ~5 calls in 30 s (≈1 every 9 s)
- **After**: ~1 call in 30 s (≈1 every 30–36 s)
- **Reduction**: ~80% reduction in versions head-check frequency during normal diagram idle.
