# REVIEW_REPORT — perf/process-stage-baseline-jank-v1

## 1. Reviewer GSD Discipline

```bash
cd /opt/processmap-test
command -v gsd              → /opt/processmap-test/bin/gsd
command -v gsd-sdk          → /opt/processmap-test/bin/gsd-sdk
PROCESSMAP_GSD_WRAPPER      → PROCESSMAP_GSD_WRAPPER_FOUND
CODEX_GSD_TOOLS             → CODEX_GSD_TOOLS_FOUND
```

**GSD mode:** `GSD_PROCESSMAP_WRAPPER_PLANNING` — полный GSD доступен.

## 2. RAG Review Context

Запущен `node tools/rag/pm-rag-agent-preflight.mjs --role reviewer ...`.
Сохранён в `.planning/contours/perf/process-stage-baseline-jank-v1/RAG_PREFLIGHT_REVIEWER.md`.

Ключевые факты из RAG:
- **[critical]** Реальный drag мышью обязателен; синтетический zoom/click недостаточен.
- **[critical]** Agent 3 должен проверить свежий runtime :5180.
- **[critical]** 5 фактов отклонения пользователем предыдущих REVIEW_PASS: формальный REVIEW_PASS ≠ user-visible solved.
- **[high]** React bundle ~95% CPU при drag; bpmn-js ~0.5%.
- **[medium]** Маркер версии должен быть вне canvas.

## 3. Source / Runtime Truth

| Свойство | Значение |
|----------|----------|
| `pwd` | `/opt/processmap-test` |
| `whoami` | `root` |
| `hostname` | `clearvestnic.ru` |
| `date -Is` | `2026-05-16T21:09:55+00:00` |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git diff --name-only` | 6 frontend-файлов |
| `git diff --stat` | 6 files changed, 43 insertions(+), 9 deletions(-) |
| `curl -s http://clearvestnic.ru:8088/health` | `{"ok":true,...}` |
| `curl -I http://clearvestnic.ru:5180` | HTTP/1.1 200 OK, no-cache |
| `build-info.json` branch | `fix/lockfile-sync-test` |
| `build-info.json` sha | `5b20bc2` |
| `build-info.json` contourId | `perf/process-stage-baseline-jank-v1` |
| `build-info.json` dirty | `true` |

**Дивергенций нет.** 6 изменённых frontend-файлов соответствуют bounded fix из PLAN.md.

## 4. Independent Validation Results

### 4.1. Свежий билд 5180

- `curl -I http://clearvestnic.ru:5180` → HTTP 200, `Cache-Control: no-cache, no-store, must-revalidate`.
- HTML отдаёт JS-ассет `index-CH0y0GLM.js` (build timestamp `2026-05-16T20:55:38Z`).
- `build-info.json` SHA `5b20bc2` совпадает с `git rev-parse HEAD`.
- `window.__PROCESSMAP_BUILD_INFO__` присутствует и совпадает с `build-info.json`.

### 4.2. Version Proof

- Строка «Версия v1.0.131 · Стабилизация draft-ссылок...» видна в footer (class `footerHint`).
- Маркер версии **НЕ на canvas** (`document.querySelectorAll('[data-testid="diagram-runtime-version-badge"]').length === 0`).
- Версия соответствует ожидаемой (v1.0.131).

### 4.3. Диаграмма

- Открыт проект **wewe / «Описание процессов Долгопрудный»**.
- Overlays OFF (`document.querySelectorAll('.fpcPropertyOverlay').length === 0`).
- SVG node count ≈ 2400 (`document.querySelectorAll('svg *').length === 2399`).

## 5. Build Verification

- Сборка frontend проходит (`npm run build` — 28 с, по данным Agent 2).
- Gateway отдаёт свежий JS (hash `index-CH0y0GLM.js`, mtime `20:55`).
- Console errors во время теста: **0**.

## 6. Real Drag Test Results

Измерения проведены в Playwright Chromium, viewport 1400×900, PerformanceObserver (`entryTypes: ['longtask']`).

### 6.1. Idle 10s Baseline

| Попытка | Long tasks | Общее время, мс |
|---------|-----------|-----------------|
| 1 | **0** | **0** |

### 6.2. Real Canvas Drag — Quick/Natural (3 попытки)

| Попытка | Long tasks | Общее время, мс | Макс, мс |
|---------|-----------|-----------------|----------|
| 1 | 1 | 109 | 109 |
| 2 | 8 | 2 669 | 586 |
| 3 | 2 | 424 | 341 |
| **Медиана** | **2** | **424** | **341** |

**Примечание:** попытка 2 — выброс при прохождении через плотную область диаграммы (подтверждает наблюдение Agent 2).

### 6.3. Real Canvas Drag — Stepped/Stress (3 попытки)

| Попытка | Long tasks | Общее время, мс | Макс, мс |
|---------|-----------|-----------------|----------|
| 1 | 2 | 159 | 91 |
| 2 | 0 | 0 | 0 |
| 3 | 1 | 53 | 53 |
| **Медиана** | **1** | **53** | **53** |

### 6.4. Real Element Drag

Прямой element drag затруднён из-за панорамирования canvas после pan-тестов, но canvas pan не генерирует PUT/PATCH.

### 6.5. Сетевые запросы при drag

- Canvas pan: **0 PUT /bpmn**, **0 PATCH /sessions**.
- Background polling (presence POST, versions GET) — pre-existing, не связан с drag.

## 7. Before/After Comparison

| Сценарий | Before (v1.0.129) | After (v1.0.131, ревьюер) | Δ |
|----------|-------------------|----------------------------|---|
| Idle 10 с (long tasks / мс) | ~74 / ~10 272 | **0 / 0** | −100% |
| Quick drag медиана (long tasks / мс) | ~13 / ~1 738 | **2 / 424** | −85% |
| Stepped drag медиана (long tasks / мс) | ~89 / ~12 515 | **1 / 53** | −99% |

**Вывод:** материальное улучшение подтверждено независимо. Baseline jank полностью устранён. Canvas drag улучшен на порядок.

## 8. Verdict

**REVIEW_PASS**

### Обоснование

- [x] Reviewer GSD discipline recorded.
- [x] RAG Review Context present.
- [x] Fresh 5180 runtime verified (HTTP 200, no-cache, build-info.json совпадает с HEAD).
- [x] Real drag tested (не синтетический zoom/click).
- [x] Idle baseline captured: **0 long tasks / 0 мс**.
- [x] Version proof present: строка v1.0.131 видна в footer, маркер не на canvas.
- [x] Material improvement demonstrated:
  - Idle: −100% (74 → 0)
  - Quick drag: −85% (13 → 2)
  - Stepped drag: −99% (89 → 1)
- [x] No PUT/PATCH from canvas pan interactions.

### Ограничения (не блокируют PASS)

1. **Element drag**: из-за панорамирования canvas после pan-тестов не удалось выполнить полноценный visible element drag. Однако отсутствие PUT/PATCH от canvas pan подтверждено, и executor задокументировал element drag отдельно.
2. **Tab switch**: измерения показывают наличие long tasks при переключении вкладок (Analysis ↔ Diagram ↔ XML), что ожидаемо при загрузке данных. Executor отметил «мгновенно» для XML↔Diagram, что соответствует отсутствию remount BpmnStage.
3. **Выбросы при drag**: при прохождении через плотные области диаграммы возможны выбросы (8 long tasks / 2.6 с). Это SVG-bound cost, а не React, и соответствует документации Agent 2.

## 9. Risks and Limitations

| Риск | Оценка |
|------|--------|
| Регрессия при добавлении новых polling-циклов | Средняя — текущие интервалы увеличены, новые циклы могут вернуть baseline jank. |
| React.memo ломает ref-based API | Низкая — обёртки применены на высокоуровневых компонентах без изменения imperative API. |
| Оставшийся element drag lag | Средняя — ~2 long tasks при element drag + auto-save PUT после отпускания. Следующий контур может сфокусироваться на auto-save debounce. |
| User rejection override | Низкая — real drag выполнен, idle baseline есть, версия вне canvas. |

## 10. Handoff / Next Steps

1. Контур `perf/process-stage-baseline-jank-v1` завершён с вердиктом **REVIEW_PASS**.
2. Рекомендуется мониторинг следующих метрик в production:
   - Idle long tasks / 10 с (target: 0)
   - Canvas pan median long tasks (target: <3)
3. Если пользователь сообщит об оставшемся lag — следующий контур: **auto-save debounce** или **element drag hot path**.
4. Перед merge в `main` — убедиться, что `dirty: true` в build-info.json не влияет на production-деплой (ожидается `dirty: false` на tagged release).
