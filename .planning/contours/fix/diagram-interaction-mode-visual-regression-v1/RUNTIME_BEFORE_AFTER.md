# RUNTIME_BEFORE_AFTER — fix/diagram-interaction-mode-visual-regression-v1

**Run ID:** 20260516T224839Z-35866

---

## Before (source)

| Параметр | Значение |
|----------|----------|
| Branch | `fix/lockfile-sync-test` |
| HEAD | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| Changed files | 11 frontend files |

## Before (runtime)

| Параметр | Значение |
|----------|----------|
| URL | http://clearvestnic.ru:5180 |
| Health | `{"ok":true,...}` |
| Build info | v1.0.132, contour `perf/...-smoothness-v1` |
| Footer version | v1.0.132 |

## After (source) — применено в Part 1

| Файл | Изменение |
|------|-----------|
| `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css` | `--bpmn-task-fill` white, `--bpmn-task-stroke` dark slate, mix 92% |
| `frontend/src/styles/legacy/legacy_bpmn.css` | Удалён viewport filter, оставлен `will-change: transform` |
| `frontend/src/styles/app/06-final-structure.css` | Удалён viewport filter, оставлен `will-change: transform` |
| `frontend/src/config/appVersion.js` | Changelog v1.0.133 обновлён |

## After (runtime) — Part 2

| Параметр | Значение |
|----------|----------|
| URL | http://clearvestnic.ru:5180 |
| Health | `{"ok":true,...}` |
| Build info | v1.0.133, contour `fix/diagram-interaction-mode-visual-regression-v1` |
| Footer version | v1.0.133 |
| Task fill | `color(srgb 1 1 1 / 0.847843)` |
| Viewport filter | `none` |
| Interaction class during pan | toggles correctly |
| White flash during pan | absent |
| Console errors | 0 |
| PUT/PATCH during pan | 0 |
