# Runtime Navigation — perf/session-analysis-bpmn-tab-switch-load-regression-v1

## Environment

- Frontend: `http://clearvestnic.ru:5180`
- API: `http://clearvestnic.ru:8088`
- API Health: `http://clearvestnic.ru:8088/health`

## Session Under Test

- Project: `Описание процессов Долгопрудный`
- Project ID: `b1c8a56b6e`
- Session: `wewe`
- Session ID: `4c515d1c6e`
- Direct URL: `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e`

## Tab Labels (as rendered)

| UI Label | Source ID |
|----------|-----------|
| Анализ процессов | `interview` |
| Diagram (BPMN) | `diagram` |
| XML | `xml` |
| DOC | `doc` |
| DOD | `dod` |

## Reproduction Steps

1. Open browser, navigate to `http://clearvestnic.ru:5180/app`
2. If not already on session, navigate to direct URL above
3. Wait for Diagram (BPMN) tab to fully load (BPMN canvas visible)
4. Click **"Анализ процессов"** tab
5. Wait for analysis content (bounds, timeline table) to appear
6. Click **"Diagram (BPMN)"** tab
7. Wait for diagram to re-appear
8. Repeat steps 4-7 two more times (total 3 cycles)

## Expected Slow Behavior

- Tab switch feels sluggish (> 1s)
- Network panel shows burst of `GET /api/sessions/4c515d1c6e/bpmn/versions?limit=1`
- Network panel shows `PATCH /api/sessions/4c515d1c6e` with 409 Conflict
- Console may show 409 error
- Possible duplicate toast/notification about versions or limits

## Evidence Paths

- Network log (Analysis switch): `.planning/contours/perf/session-analysis-bpmn-tab-switch-load-regression-v1/evidence/network-after-analysis.log`
- Network log (Diagram return): `.planning/contours/perf/session-analysis-bpmn-tab-switch-load-regression-v1/evidence/network-after-diagram-return.log`
- Console log: `.planning/contours/perf/session-analysis-bpmn-tab-switch-load-regression-v1/evidence/console-after-analysis.log`
- Screenshot: `.planning/contours/perf/session-analysis-bpmn-tab-switch-load-regression-v1/evidence/tab-switch-screenshot-after-cycle.png`
