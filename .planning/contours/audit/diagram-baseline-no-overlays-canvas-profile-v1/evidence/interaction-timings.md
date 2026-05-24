# Interaction Timings

## Methodology
- Timings measured via `performance.now()` where possible
- Subjective latency observed via Playwright automation
- No Chrome DevTools performance trace available

## Scenario A — Baseline Load
| Step | Approx Time |
|------|-------------|
| Navigate to /app | ~1s |
| Click session "wewe" | ~1s |
| Diagram tab render | ~2s |
| Total to visible canvas | ~4s |

## Scenario B — Pan/Zoom
| Action | Subjective Feel | DOM Change |
|--------|----------------|------------|
| Pan (drag 50px) | Smooth, no perceptible lag | 0 |
| Pan back | Smooth | 0 |
| Zoom in (button click) | Smooth | 0 |
| Zoom out (button click) | Smooth | 0 |

## Scenario C — Selection
| Click # | Element | Subjective Feel | DOM Δ |
|---------|---------|----------------|-------|
| 1 | Event_1duwp2k | Slight delay (~100–200ms) | +3201 |
| 2 | Activity_1c5b5zb | Slight delay | +25 |
| 3 | Gateway_08u1e7m | Slight delay | -24 |
| 4–10 | Various | Slight delay | ±0–25 |

**Observation**: First selection has the largest DOM spike. Subsequent selections fluctuate slightly but stay in the ~11,200 range.

## Scenario D — Hover
| Hover # | Element | Subjective Feel | DOM Δ |
|---------|---------|----------------|-------|
| 1–10 | Various | Instant, no lag | 0 |

## Scenario E — Tab Switch
| Step | Subjective Feel | DOM Δ |
|------|----------------|-------|
| Diagram → Analysis | Instant | 0 |
| Analysis → Diagram | Instant | 0 |
| Diagram → XML | Instant | 0 |
| XML → Diagram | ~200ms re-render | -3198 (cleanup) |

## Scenario F — Overlays Toggle
| Action | Result |
|--------|--------|
| Click "Слои ON ⚠ hidden" | No response in Playwright |
| .fpcPropertyOverlay | Remains 0 |

**Limitation**: Cannot measure overlays ON vs OFF latency in this session.
