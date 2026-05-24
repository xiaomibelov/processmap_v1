# perf/diagram-human-perceived-pan-and-drag-smoothness-v1

## GSD Discipline

Запущенные команды:
```bash
cd /opt/processmap-test
echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*' 2>/dev/null | sort | head -50 || true
find /root/.codex/agents -maxdepth 2 -type d -name 'gsd-*' 2>/dev/null | sort | head -50 || true
/opt/processmap-test/bin/gsd 2>&1 | head -40 || true
/opt/processmap-test/bin/gsd-sdk 2>&1 | head -40 || true
```

Результаты:
- `command -v gsd` → `/opt/processmap-test/bin/gsd` ✅
- `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk` ✅
- `PROCESSMAP_GSD_WRAPPER_FOUND` ✅
- `CODEX_GSD_TOOLS_FOUND` ✅
- Найдено 50+ GSD-скиллов в `/root/.codex/skills/gsd-*` ✅
- GSD mode: `GSD_PROCESSMAP_WRAPPER_PLANNING` — полный GSD доступен через ProcessMap-обёртку.

Подтверждения:
- Продуктовый код не изменялся Agent 1.
- Product-файлы не редактировались.
- Никаких коммитов/пушей/PR/деплоев.

## RAG Preflight

Команды:
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "perf/diagram-human-perceived-pan-and-drag-smoothness-v1" \
  --area "Diagram human perceived pan drag smoothness pointer-follow latency visual jitter dense SVG bpmn-js canvas" \
  --format md \
  --top-k 12

node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "perf/diagram-human-perceived-pan-and-drag-smoothness-v1" \
  --query "Diagram performance review rules user manual validation pointer-follow latency real drag smoothness no false REVIEW_PASS" \
  --format md \
  --top-k 12
```

Результаты сохранены:
- `RAG_PREFLIGHT_PLANNER.md` — structured facts, user rejections, contour facts, bottleneck facts, supporting BM25 documents.
- `RAG_PREFLIGHT_REVIEWER.md` — reviewer-oriented rules, rejection overrides, required gates.

Использованные structured facts:
- 5 user rejection facts переопределяют formal REVIEW_PASS предыдущих контуров.
- Bottleneck: React bundle ~95% CPU при drag; bpmn-js ~0.5%.
- Критическое правило: реальный drag мышью обязателен; синтетический zoom/click недостаточен.
- Решение: version marker не на canvas; decomposition-first для god-файлов.

BM25-документы использованы:
- `fix/diagram-real-drag-performance-and-engine-decomposition-v1/PLAN.md` — real drag scenario.
- `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/ENGINE_LIMIT_NOTE.md` — engine not bottleneck.
- `fix/diagram-canvas-reload-loop-and-lag-regression-v1/RUNTIME_NAVIGATION.md` — pan/zoom scenarios.
- `audit/diagram-property-overlays-performance-gsd-v1/RUNTIME_NAVIGATION.md` — subjective smoothness measurement.

Отклонённые/устаревшие контексты:
- Старые контуры, где formal REVIEW_PASS ≠ user-visible solved — использованы как предупреждения, не как шаблоны для повторения.
- RAG-инструменты не дают auto-mutation — только read-only context.

## Source / Runtime Truth

| Свойство | Значение |
|----------|----------|
| `pwd` | `/opt/processmap-test` |
| `whoami` | `root` |
| `hostname` | `clearvestnic.ru` |
| `date -Is` | `2026-05-16T21:35:34+00:00` |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git diff --name-only` | 6 frontend-файлов (из предыдущего контура `perf/process-stage-baseline-jank-v1`) |
| `git diff --stat` | 6 files changed, 43 insertions(+), 9 deletions(-) |
| `curl -s http://clearvestnic.ru:8088/health` | `{"ok":true,...}` |
| `curl -I http://clearvestnic.ru:5180` | HTTP/1.1 200 OK, no-cache |
| `build-info.json` branch | `fix/lockfile-sync-test` |
| `build-info.json` sha | `5b20bc2` |
| `build-info.json` contourId | `perf/process-stage-baseline-jank-v1` |
| `build-info.json` dirty | `true` |
| Served JS asset | `assets/index-CH0y0GLM.js` |
| Текущая версия | `v1.0.131` |

Docker runtime:
- `processmap_test-gateway-1` → Up 39 minutes, :5180→80
- `processmap_test-frontend-1` → Up 28 hours
- `processmap_test-api-1` → Up 2 days, :8088→8000
- `processmap_test-postgres-1` → healthy
- `processmap_test-redis-1` → healthy

## User Manual Validation

Пользователь вручную протестировал runtime v1.0.131 после контура `perf/process-stage-baseline-jank-v1` и сообщил:

- «Стало может на 10% плавнее.»
- «Всё ещё дергается.»
- «Всё ещё не двигается плавно.»
- «Ощущение, что canvas не поспевает за движением указателя.»

Интерпретация:
- `formal_verdict` = REVIEW_PASS (Agent 3 подтвердил метрики).
- `user_visible_verdict` = not_solved.
- Проблема = человеко-воспринимаемое отставание canvas за указателем / визуальный jitter.
- Предыдущие метрики long-task недостаточны как критерии приёмки.

Почему следующий контур должен измерять smoothness / pointer-follow latency:
- Long tasks измеряют блокировки main thread, но не измеряют визуальную плавность transform-обновлений.
- Playwright synthetic drag не воспроизводит точно человеческий ввод.
- Пользователь воспринимает jitter и lag, которые могут быть в пределах 16–33 мс и не регистрироваться как long tasks.

Почему REVIEW_PASS блокируется, если jitter остаётся:
- 5 фактов отклонения пользователем в RAG-реестре переопределяют formal REVIEW_PASS.
- Если user-visible jitter остаётся материально заметным — контур не solved.

## Previous Performance Evidence

### perf/process-stage-baseline-jank-v1 (v1.0.131)
- Formal REVIEW_PASS.
- Метрики улучшились:
  - Idle 10 с: 0 long tasks / 0 мс (было ~74 / ~10 272)
  - Quick drag median: 2 long tasks / 424 мс (было ~13 / ~1 738)
  - Stepped drag median: 1 long task / 53 мс (было ~89 / ~12 515)
  - Нет PUT/PATCH при canvas pan.
  - 0 console errors.
- Однако пользователь отклонил user-visible completion.
- Вывод: React baseline jank устранён, но осталась визуальная дерганность.

### perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1
- Formal REVIEW_PASS, user_visible=not_solved, accepted=false.
- Profiler: React bundle ~95% CPU, bpmn-js ~0.5%.
- `isCanvasPanningActive` guard реализован.

### fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1
- Formal REVIEW_PASS, user_visible=not_solved, accepted=false.
- Фокус на review process и version ledger, а не на drag performance.

### fix/diagram-real-drag-performance-and-engine-decomposition-v1
- Formal REVIEW_PASS, user_visible=not_solved, accepted=false.
- Version marker на canvas — пользователь отклонил.

### Общий вывод
- Формальные метрики long tasks улучшились материально.
- Человеко-воспринимаемая плавность не достигнута.
- Следующий контур должен измерять smoothness, pointer-follow latency, frame pacing.
- REVIEW_PASS блокируется при оставшемся jitter.

## Human-Perceived Smoothness Problem

Проблема не в количестве long tasks, а в:
1. Визуальном отставании canvas transform от положения указателя.
2. Неравномерном frame pacing (некоторые кадры >16.7ms, >33ms).
3. Jitter в плотных областях диаграммы (много SVG-элементов).
4. Возможных side effects во время active pan/drag (hover, selection, panel updates).
5. CSS/SVG paint costs во время interaction.

Целевое состояние:
- Canvas плавно следует за указателем без заметного отставания.
- Jitter в плотных областях либо устранён, либо точно изолирован.
- Element drag протестирован и плавен или задокументирован как отдельный bottleneck.

## Reviewer/Test GSD Discipline

Agent 3 обязан:
1. Запустить GSD checks:
```bash
cd /opt/processmap-test
echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
```
2. Если GSD доступен — использовать GSD review/check discipline.
3. Если GSD недоступен — продолжить как `GSD_FALLBACK_MANUAL_REVIEW_ONLY` и задокументировать fallback в `REVIEW_REPORT.md`.

## Reviewer RAG Preflight Requirement

Agent 3 обязан запустить:
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "perf/diagram-human-perceived-pan-and-drag-smoothness-v1" \
  --query "Diagram performance review rules user manual validation pointer-follow latency real drag smoothness no false REVIEW_PASS" \
  --format md \
  --top-k 12
```

Сохранить в `RAG_PREFLIGHT_REVIEWER.md` (или обновить существующий).

`REVIEW_REPORT.md` должен содержать:
- ## Reviewer GSD Discipline
- ## RAG Review Context
- ## Human-Perceived Smoothness Review

## Version / Update Ledger Plan

Текущая версия: `v1.0.131`
Каноническая следующая версия: `v1.0.132`

Agent 2 должен:
1. Обновить `frontend/src/config/appVersion.js`:
   - `currentVersion: "v1.0.132"`
   - Добавить changelog entry:
     - human-perceived pan/drag smoothness
     - pointer-follow latency / frame pacing
     - dense-region jitter reduction
     - RAG preflight used
2. Пересобрать frontend (`npm run build`).
3. Убедиться, что `build-info.json` и `window.__PROCESSMAP_BUILD_INFO__` валидны.
4. Маркер версии должен быть в footer (`footerHint`), не на canvas.

Agent 3 должен отклонить review, если:
- Строка версии отсутствует.
- Маркер на canvas.
- `build-info.json` не совпадает с runtime.
- 5180 stale.

## Smoothness Reproduction Plan

Agent 2 должен воспроизвести реальную жалобу пользователя:
1. Открыть fresh browser context на `http://clearvestnic.ru:5180/?cb=<timestamp>`.
2. Перейти к wewe / «Описание процессов Долгопрудный».
3. Отключить overlays (`window.fpcPropertyOverlay = 0`).
4. Выполнить реальный canvas pan / element drag.
5. Зафиксировать субъективную оценку:
   - smooth
   - slightly jittery
   - materially jittery
   - unusable

## Pointer-Follow Latency Measurement Plan

Измерить, если технически возможно:
- pointermove event timestamp.
- Следующий requestAnimationFrame timestamp.
- Canvas/viewbox/transform update timestamp (если доступен через DOM mutation observer или bpmn-js API).
- Распределение frame gaps.
- p95 frame gap.
- max frame gap during drag.

Если прямое pointer-to-transform измерение невозможно:
- Задокументировать ограничение.
- Измерить frame pacing и transform mutation cadence через MutationObserver + PerformanceObserver.

## Frame Pacing Measurement Plan

Во время 3-секундного pan/drag:
- Собрать RAF deltas.
- Отчитать:
  - total frames
  - avg frame delta
  - p95 frame delta
  - max frame delta
  - frames > 16.7ms
  - frames > 33ms
  - frames > 50ms

Инструмент: браузерный snippet через Playwright `page.evaluate` или DevTools Performance timeline.

## Dense Region Measurement Plan

Сценарии:
1. Пустая область canvas pan (3 попытки).
2. Плотная область canvas pan (3 попытки).
3. Сравнение frame pacing между пустой и плотной областью.
4. DOM/SVG node counts:
   - `document.querySelectorAll('*').length`
   - `document.querySelectorAll('svg *').length`
   - `document.querySelectorAll('.djs-container').length`
   - `.fpcPropertyOverlay`, `.djs-overlay`, `.fpcFocusDim`, `.fpcAnalyticsSelected`, `.djs-bendpoint`, `.djs-segment-dragger`

## Element Drag Measurement Plan

1. Выбрать BPMN-элемент в Modeler default.
2. Перетащить на 100–200 px.
3. 3 попытки.
4. Измерить:
   - frame pacing
   - jitter
   - property panel / render impact
   - auto-save PUT /bpmn после отпускания (pre-existing, не регрессия)
5. Убедиться, что нет unintended durable save во время drag.

## Source Map Targets

Кандидатные файлы (из поиска grep):

### God-файлы (memo-границы уже добавлены в v1.0.131)
- `frontend/src/components/ProcessStage.jsx` (6880 строк) — корневой оркестратор.
- `frontend/src/components/process/BpmnStage.jsx` (5813 строк) — обёртка bpmn-js.
- `frontend/src/components/process/InterviewStage.jsx` — поверхность анализа.
- `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx` (1700+ строк) — toolbar.

### Side-effect guards и event wiring
- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
- `frontend/src/features/process/bpmn/stage/interaction/diagramDragSideEffectGuard.js`
- `frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js`
- `frontend/src/features/process/bpmn/stage/derived/elementSelectionEmitter.js`
- `frontend/src/features/process/bpmn/stage/derived/decorManager.js`
- `frontend/src/features/process/bpmn/stage/load/overlayLayoutModel.js`

### Canvas / viewport controllers
- `frontend/src/features/process/stage/controllers/useBpmnCanvasController.js`
- `frontend/src/features/process/stage/controllers/useBpmnViewportSource.js`

### Hooks с нестабильными зависимостями
- `frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js`
- `frontend/src/features/process/stage/utils/useStableDiagramControlsView.js`
- `frontend/src/features/process/stage/utils/useStableDraft.js`

### Property panel / toolbar
- `frontend/src/components/NotesPanel.jsx`
- `frontend/src/components/sidebar/ElementSettingsControls.jsx`
- `frontend/src/components/sidebar/SelectedNodeSection.jsx`
- `frontend/src/components/notesPanel/useNotesPanelController.js`

### CSS / theme (возможные paint costs)
- `frontend/src/shared/styles/` — тёмная тема, transitions, opacity, shadows.
- `frontend/src/components/process/` — BPMN-specific styles.

### Version / update ledger
- `frontend/src/config/appVersion.js`
- `frontend/src/features/process/stage/ui/DiagramRuntimeVersionBadge.jsx`
- `scripts/generate-build-info.mjs`

Подозреваемые источники smoothness:
- CSS transitions, opacity changes, filter/shadow effects во время pan.
- Hover/selection side effects через `element.hover` / `element.out` / `selection.changed`.
- Property panel sync на каждое движение указателя.
- Overlay RAF scheduling через `useBpmnSettledDecorFanout`.
- React micro-renders в sidebar/toolbar во время canvas interaction.

Безопасные границы изменений:
- Только frontend-файлы.
- Не трогать backend, schema, storage.
- Не трогать Product Actions, RAG runtime, AG-UI.
- Не устанавливать пакеты.
- Не менять BPMN XML семантику.

## Hypotheses

### H1. Визуальный jitter вызван SVG repaint/composite cost в плотных областях.
- Доказательство: frame pacing хуже в плотной области, чем в пустой; React long tasks минимальны, но transform обновления всё равно дергаются.

### H2. Pointer-follow latency вызван cadence обновления bpmn-js canvas pan transform.
- Доказательство: лаг между положением указателя и обновлением viewbox/transform.

### H3. Необязательные side effects всё ещё выполняются во время active pan/drag.
- Доказательство: event handlers, hover/selection, panels, toolbars, state updates во время active drag.

### H4. CSS/SVG эффекты увеличивают paint cost во время interaction.
- Доказательство: отключение эффектов во время interaction улучшает frame pacing.

### H5. Text/stroke/label rendering в большом SVG вызывает frame drops в плотных областях.
- Доказательство: frame gaps коррелируют с количеством видимых SVG nodes/text.

### H6. React в основном чист, но всё ещё есть micro-renders во время pointer movement.
- Доказательство: render counters / profiler показывают небольшие но периодические commits во время pan.

### H7. Playwright long-task metrics недостаточны для оценки человеческой плавности.
- Доказательство: manual-like smoothness check показывает jitter несмотря на улучшенный long-task count.

### H8. Element drag имеет другой bottleneck, чем canvas pan.
- Доказательство: frame pacing element drag отличается от canvas pan.

### H9. Оставшаяся проблема требует interaction-mode optimization или альтернативного viewer spike.
- Доказательство: после подавления side effects / paint остаточный jitter сохраняется в SVG engine.

## Decomposition-First Plan

Если Agent 2 затрагивает ProcessStage или BpmnStage:
1. Не добавлять новую логику напрямую в god-файлы без явного обоснования.
2. Выделить interaction-mode logic в отдельный модуль:
   - `frontend/src/features/process/bpmn/stage/interaction/diagramInteractionMode.js`
3. Выделить CSS interaction-state в отдельный файл:
   - `frontend/src/features/process/bpmn/stage/styles/diagramInteraction.css`
4. Выделить frame-pacing instrumentation в отдельный модуль (если нужен):
   - `frontend/src/features/process/bpmn/stage/analytics/diagramFramePacing.js`
5. Документировать извлечение в `DECOMPOSITION_REPORT.md`.

## Bounded Fix Strategy

Agent 2 должен выбрать направление на основе evidence, а не заранее.

### Option A — Interaction mode suppressor
- При active canvas pan / element drag:
  - Добавить root class `.fpcDiagramInteracting`.
  - Отключить дорогие hover/selection эффекты.
  - Отложить sync property panel.
  - Подавить необязательные React state updates.
  - Восстановить на pointerup/cancel.

### Option B — Dense SVG repaint reduction
- Уменьшить CSS-эффекты во время interaction:
  - shadows, filters, transitions, heavy strokes, text effects.
- Использовать interaction-mode CSS только во время drag/pan.

### Option C — RAF transform / side-effect coalescing
- Side effects не чаще одного раза за кадр.
- Не запускать analytics/decor/panel sync на каждый pointermove.

### Option D — Hover/selection freeze during pan
- Во время canvas panning:
  - Игнорировать hover/out events.
  - Не ре-рендерить hover UI.
  - Не обновлять selected state до pointerup.

### Option E — Canvas container isolation
- Убедиться, что canvas area не вызывает layout/reflow окружающих панелей.
- CSS containment: `contain`, `will-change`, transform isolation — только после evidence и с regression checks.

### Option F — Element drag-specific side-effect guard
- Отделить element drag от canvas pan.
- Подавить non-essential updates во время element drag.
- Восстановить после command completion / pointerup.

### Option G — Next bottleneck decision
- Если bounded frontend improvement не может материально улучшить smoothness:
  - `NEXT_BOTTLENECK_DECISION.md` с рекомендацией:
    - `perf/diagram-svg-dense-region-rendering-v1`
    - `architecture/server-side-diagram-read-model-and-frontend-offload-v1`
    - `research/diagram-alternative-large-viewer-spike-v1`

## Acceptance Criteria

### Agent 2 must deliver:
1. `EXEC_REPORT.md` — полный отчёт выполнения (на русском).
2. `RAG_PREFLIGHT_EXECUTOR.md` — RAG preflight executor.
3. `VERSION_UPDATE_LEDGER_PROOF.md` — доказательство версии.
4. `HUMAN_PERCEIVED_SMOOTHNESS_BASELINE.md` — baseline до кода.
5. `HUMAN_PERCEIVED_SMOOTHNESS_BEFORE_AFTER.md` — before/after.
6. `POINTER_FOLLOW_LATENCY_PROFILE.md` — latency evidence.
7. `FRAME_PACING_PROFILE.md` — RAF frame pacing.
8. `DENSE_REGION_RENDERING_PROFILE.md` — dense region behavior.
9. `ELEMENT_DRAG_SMOOTHNESS_PROFILE.md` — element drag evidence.
10. `SMOOTHNESS_ROOT_CAUSE.md` — root cause analysis.
11. `RUNTIME_BEFORE_AFTER.md` — runtime proof.
12. `DECOMPOSITION_REPORT.md` — если было извлечение.
13. `IMPLEMENTATION_NOTES.md` — технические детали.
14. `NEXT_BOTTLENECK_DECISION.md` — если не materially solved.
15. `READY_FOR_REVIEW` или `EXEC_BLOCKED.md`.

### Agent 3 must verify:
1. Свежий 5180 runtime (HTTP 200, no-cache).
2. Версия v1.0.132 в footer, не на canvas.
3. build-info.json и `window.__PROCESSMAP_BUILD_INFO__` валидны.
4. Реальный manual-like canvas pan на large no-overlays Diagram.
5. Dense-region drag — jitter материально уменьшен или точно изолирован.
6. Element drag — протестирован или явно заблокирован с доказательством.
7. Before/after human smoothness classification улучшился.
8. Frame pacing улучшился материально или следующий bottleneck точно доказан.
9. Нет PUT/PATCH от view interactions.
10. ## Reviewer GSD Discipline, ## RAG Review Context, ## Human-Perceived Smoothness Review присутствуют в REVIEW_REPORT.md.

### No REVIEW_PASS if:
- Только source/build прошёл.
- Long-task count улучшился, но jitter остался.
- Нет real drag test.
- Нет dense-region test.
- Нет element drag test (если не невозможно с доказательством).
- Нет RAG Review Context.
- Нет version proof.
- Нет material perceived improvement и нет precise next bottleneck.

## Non-goals

- Не изменять backend/schema/storage.
- Не изменять Product Actions.
- Не изменять RAG tooling.
- Не изменять AG-UI.
- Не устанавливать пакеты.
- Не менять BPMN XML семантику.
- Не делать deploy stage/prod.
- Не делать commit/push/PR.
- Не внедрять полноценный альтернативный engine.
- Не заменять SVG на WebGL/canvas в этом контуре.
- Не писать product code как Agent 1.

## Agent 2 Execution Plan

1. RAG preflight executor → сохранить в `RAG_PREFLIGHT_EXECUTOR.md`.
2. Source/runtime truth → зафиксировать в `EXEC_REPORT.md`.
3. Baseline human-perceived smoothness (до кода):
   - Real canvas pan (empty, dense, quick, slow, diagonal).
   - Real element drag.
   - Записать классификацию и заметки.
   - Сохранить в `HUMAN_PERCEIVED_SMOOTHNESS_BASELINE.md`.
4. Baseline measurement:
   - Pointer-follow latency (если возможно).
   - Frame pacing (RAF deltas).
   - DOM/SVG counts.
   - Сохранить в соответствующие PROFILE-файлы.
5. Identify bottleneck:
   - Проверить H1–H9 на evidence.
   - Записать в `SMOOTHNESS_ROOT_CAUSE.md`.
6. Implement bounded fix:
   - На основе evidence выбрать Option A–F.
   - Соблюдать decomposition-first.
   - Обновить version row до v1.0.132.
7. Rebuild & restart:
   - `npm run build`
   - Перезапустить gateway (`docker compose restart gateway`)
   - Убедиться, что 5180 отдаёт свежий JS.
8. Validation after code:
   - Повторить измерения.
   - Сохранить `HUMAN_PERCEIVED_SMOOTHNESS_BEFORE_AFTER.md`.
   - Сохранить `RUNTIME_BEFORE_AFTER.md`.
9. Write `READY_FOR_REVIEW` или `EXEC_BLOCKED.md`.

## Agent 3 Review Plan

1. Reviewer GSD discipline → записать в `REVIEW_REPORT.md`.
2. Reviewer RAG preflight → записать в `REVIEW_REPORT.md`.
3. Independent source/runtime truth → сверить с Agent 2.
4. Fresh 5180 proof:
   - `curl -I http://clearvestnic.ru:5180`
   - build-info.json совпадает с HEAD.
   - `window.__PROCESSMAP_BUILD_INFO__` валиден.
5. Version proof:
   - Footer показывает v1.0.132.
   - Маркер не на canvas.
6. Real manual-like canvas pan:
   - Пустая область.
   - Плотная область.
   - Быстрый / медленный drag.
   - Диагональный drag.
7. Element drag:
   - Перетащить BPMN-элемент.
   - Оценить плавность.
8. Human-perceived smoothness:
   - Записать в `REVIEW_REPORT.md` раздел ## Human-Perceived Smoothness Review.
   - Ответить:
     - Canvas плавно следовал за указателем?
     - Dense-region drag всё ещё дергается?
     - Element drag плавен?
     - Ощущается ли улучшение по сравнению с v1.0.131?
     - Пользователь бы воспринял улучшение?
     - Если нет — почему это не REVIEW_PASS?
9. Frame pacing:
   - Если Agent 2 предоставил frame pacing data — проверить consistency.
10. Safety:
    - Нет PUT/PATCH от view pan.
    - Нет console errors.
    - Нет regression tab switch.

## Risks

| Риск | Оценка | Митигация |
|------|--------|-----------|
| Оставшийся jitter вызван bpmn-js engine, а не React/CSS. | Средняя | Profiler из предыдущих контуров показывает engine ~0.5%, но визуальный jitter может быть в RAF/SVG composite. Если evidence укажет на engine — направить в NEXT_BOTTLENECK_DECISION. |
| Playwright synthetic drag не воспроизводит human input. | Высокая | Agent 2 и Agent 3 обязаны использовать real mouse down/move/up и субъективную оценку. |
| CSS containment / will-change вызывает regression. | Средняя | Только после evidence; с regression checks (tab switch, selection, zoom). |
| Property panel / toolbar suppression ломает UX. | Средняя | Восстановление на pointerup; тестировать selection/hover после drag. |
| Element drag auto-save PUT воспринимается как regression. | Низкая | Документировать как pre-existing; не блокировать contour, если не ухудшилось. |
| Версионные тесты (snapshot) ломаются при bump. | Низкая | Обновить `appVersion.js` и проверить `npm run build`. |

## Gates

- [x] PLAN.md написан.
- [x] EXECUTOR_PROMPT.md написан.
- [x] REVIEWER_PROMPT.md написан.
- [x] STATE.json валиден.
- [x] AGENT_RUN_ID записан (`20260516T213420Z-31691`).
- [ ] Agent 2 выполнил implementation.
- [ ] Agent 2 написал все required reports.
- [ ] Agent 2 создал `READY_FOR_REVIEW`.
- [ ] Agent 3 выполнил independent review.
- [ ] Agent 3 подтвердил human-perceived smoothness improvement.
- [ ] Agent 3 выставил REVIEW_PASS или CHANGES_REQUESTED.
