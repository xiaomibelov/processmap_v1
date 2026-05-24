# perf/process-stage-baseline-jank-v1

## GSD Discipline

```bash
cd /opt/processmap-test
command -v gsd              → /opt/processmap-test/bin/gsd
command -v gsd-sdk          → /opt/processmap-test/bin/gsd-sdk
PROCESSMAP_GSD_WRAPPER      → FOUND
CODEX_GSD_TOOLS             → FOUND
GSD skills found            → 50+ gsd-* directories under /root/.codex/skills
```

**GSD mode:** `GSD_PROCESSMAP_WRAPPER_PLANNING` — полный GSD доступен.

- Команды запущены: `command -v gsd`, `gsd usage` (неизвестная команда, но бинарий найден), `find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*'`.
- Результат: GSD wrapper и Codex tools найдены. Fallback не требуется.
- Подтверждение: продуктовый код не изменялся планировщиком.
- Подтверждение: файлы frontend/backend не редактировались.

## RAG Preflight

### Команды

```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "perf/process-stage-baseline-jank-v1" \
  --area "Diagram performance React baseline jank ProcessStage App shell drag lag" \
  --format md \
  --top-k 10

node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "perf/process-stage-baseline-jank-v1" \
  --query "Diagram performance review rules React baseline jank real drag fresh 5180 proof user rejection override" \
  --format md \
  --top-k 10
```

### Факты, использованные в плане

- **Критические правила Agent 3:** реальный drag мышью обязателен; синтетический zoom/click недостаточен.
- **User rejection overrides:** 5 фактов отклонения пользователем предыдущих REVIEW_PASS, включая:
  - `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1` — формальный REVIEW_PASS, но drag lag не решён.
  - `fix/diagram-real-drag-performance-and-engine-decomposition-v1` — маркер версии на canvas мешает взаимодействию.
  - `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1` — REVIEW_PASS был на процессе review, не на фиксе производительности.
- **Bottleneck факты:** React bundle ~95% CPU при drag; bpmn-js engine ~0.5%.
- **Contour facts:** текущий контур `perf/process-stage-baseline-jank-v1` — следующий в очереди после незавершённых drag-оптимизаций.

### BM25 документы

- `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/VALIDATION_QUERIES.md` — Query 3: Current Diagram Lag Bottlenecks.
- `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/REVIEW_REPORT.md` — handoff с рекомендацией следующего контура.
- `audit/diagram-post-optimization-runtime-profile-v1/RESIDUAL_BOTTLENECKS.md` — H6: React/session shell triggers unrelated updates.
- `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/PLAN.md` — user rejection of previous REVIEW_PASS.

### Принятый / проигнорированный контекст

- **Принят:** React baseline jank в ProcessStage/AppShell — основной подозреваемый.
- **Принят:** версия/маркер должны быть вне canvas.
- **Проигнорирован:** RAG embedding search (вне scope).
- **Проигнорирован:** backend read model / AG-UI / Product Actions.

### Как RAG изменил этот план

RAG подтвердил, что предыдущие drag-hot-path фиксы не улучшили user-visible lag. Profiler evidence (React 95%) уже зафиксирован в фактах. План сфокусирован на React-рендере, а не на bpmn-js engine.

## Source / Runtime Truth

| Свойство | Значение |
|----------|----------|
| `pwd` | `/opt/processmap-test` |
| `whoami` | `root` |
| `hostname` | `clearvestnic.ru` |
| `date -Is` | `2026-05-16T20:02:29+00:00` |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git diff --name-only` | 8 pre-existing frontend файлов |
| `git diff --stat` | 8 files changed, 55 insertions(+), 9 deletions(-) |
| `curl -s http://clearvestnic.ru:8088/health` | `{"ok":true,...}` |
| `curl -I http://clearvestnic.ru:5180` | HTTP/1.1 200 OK, no-cache |
| Docker compose services | gateway, frontend, api, postgres, redis |
| `build-info.json` branch | `fix/lockfile-sync-test` |
| `build-info.json` sha | `a9a9d9c` |
| `build-info.json` contourId | `perf/process-stage-baseline-jank-v1` |
| `build-info.json` dirty | `true` |
| `appVersion.js` currentVersion | `v1.0.130` |

**Дивергенций нет.** 8 изменённых frontend-файлов — pre-existing на ветке `fix/lockfile-sync-test`, не связаны с текущим контуром.

## Previous Drag-Hot-Path Result

### perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1

- **Формальный вердикт:** REVIEW_PASS.
- **User-visible вердикт:** not_solved / accepted=false.
- **Profiler evidence:** bpmn-js engine ≈ 0.5% CPU (getCTM); React bundle ≈ 95% CPU.
- **Результат drag-тестов:** метрики в пределах погрешности измерения; synthetic drag не надёжно триггерит MoveCanvas.
- **Handoff:** рекомендован следующий контур `perf/process-stage-baseline-jank-v1` для профилирования React render trees.

### fix/diagram-real-drag-performance-and-engine-decomposition-v1

- **Формальный вердикт:** REVIEW_PASS.
- **User-visible вердикт:** not_solved — маркер версии на canvas мешал взаимодействию.

### fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1

- **Формальный вердикт:** REVIEW_PASS.
- **User-visible вердикт:** not_solved — REVIEW_PASS был на review-процессе, не на реальном фиксе lag.

**Вывод:** формальный REVIEW_PASS ≠ user-visible solved. Если метрики в пределах шума — REVIEW_PASS не допускается.

## React Baseline Jank Problem

### Диагностика

- Даже в idle (без действий пользователя) приложение генерирует ~7 long tasks/sec.
- Переключение вкладок Analysis ↔ Diagram занимает 4–6 секунд.
- DOM node count стабилен (≈8000), значит проблема не в remount, а в React re-render / recompute.
- BpmnStage получает пропсы от ProcessStage, который получает состояние от AppShell — длинная цепочка rerender.

### Подозреваемые источники

1. **ProcessState.jsx (6880 строк)** — god-file с десятками `useEffect`, `useMemo`, `useCallback`, нестабильные объекты.
2. **BpmnStage.jsx (5813 строк)** — god-file с 20+ `useEffect`, нестабильные адаптеры (`useMemo` без глубокой стабилизации).
3. **App.jsx / AppShell.jsx** — верхнеуровневое состояние (selectedElement, focus, discussion intents) прокидывается вниз.
4. **useInterviewDerivedState.js** — 40+ `useMemo` вычислений на каждый render.
5. **Polling:** session presence (45s heartbeat), remote save version poll (9s), app update poll (120s), undo/redo poll (2s visible).
6. **Property panel / NotesPanel** —selectedElement меняется при drag → sidebar пересчитывает сотни `useMemo`.
7. **Toolbar / discussions / search / focus controls** — обновляются при любом изменении selection.
8. **Version/update ledger** — уже вынесен в footer, но rebuild-info пересчитывается.

## Reviewer/Test GSD Discipline

Agent 3 обязан:
- Запустить `command -v gsd`, проверить `PROCESSMAP_GSD_WRAPPER_FOUND`.
- Записать секцию `## Reviewer GSD Discipline` в REVIEW_REPORT.md.
- Независимо проверить source/runtime truth.

## Reviewer RAG Preflight Requirement

Agent 3 обязан:
- Запустить `node tools/rag/pm-rag-agent-preflight.mjs --role reviewer ...`.
- Сохранить вывод в `RAG_PREFLIGHT_REVIEWER.md`.
- Включить `## RAG Review Context` в REVIEW_REPORT.md.
- Проверить user rejection overrides перед вердиктом.

## Version / Update Ledger Plan

### Текущее состояние

- `frontend/src/config/appVersion.js` → `currentVersion: "v1.0.130"`.
- `build-info.json` → `contourId: "perf/process-stage-baseline-jank-v1"`, `shaShort: "a9a9d9c"`.
- Версия уже ассоциирована с этим контуром (pre-existing на ветке).

### План для Agent 2

- Если продуктовые изменения не производятся — оставить `v1.0.130`.
- Если производятся изменения frontend → **bump to v1.0.131** с записью в changelog.
- Маркер версии должен быть **вне canvas** (footer / bottom row).
- `build-info.json` и `window.__PROCESSMAP_BUILD_INFO__` должны быть валидны.

### Agent 3 gate

- Версия должна быть видна.
- Маркер не на canvas.
- `build-info.json` совпадает с runtime.

## Baseline Jank Reproduction Plan

### Целевая диаграмма

- Проект: **wewe**
- Сессия: **«Описание процессов Долгопрудный»**
- Overlays: **OFF** (подтвердить `.fpcPropertyOverlay = 0`)

### Сценарии

**A. Fresh version proof**
- Открыть `http://clearvestnic.ru:5180/?cb=<timestamp>` в fresh browser context.
- Проверить строку версии внизу.
- Проверить `build-info.json`.
- Убедиться, что маркер версии не на canvas.

**B. Idle 10s baseline**
- Открыта большая диаграмма, overlays off.
- 10 секунд без действий.
- Измерить long tasks, DOM/SVG stability, network, console.

**C. Real canvas drag quick/natural**
- 3 попытки.
- Median long tasks / duration.

**D. Real canvas drag stepped/stress**
- 3 попытки.
- Median long tasks / duration.

**E. Real element drag**
- Drag BPMN-элемента в Modeler default.
- Long tasks / duration.
- Проверить отсутствие PUT/PATCH.

**F. Tab switch**
- Analysis → Diagram → XML → Diagram.
- Время до usable canvas.

**G. Profiler attribution**
- React DevTools Profiler: какие компоненты/хуки доминируют.

## Measurement Plan

### Обязательные browser counts

```js
document.querySelectorAll('*').length
document.querySelectorAll('svg *').length
document.querySelectorAll('.djs-container').length
document.querySelectorAll('.fpcPropertyOverlay').length
document.querySelectorAll('.djs-overlay').length
document.querySelectorAll('.fpcFocusDim').length
document.querySelectorAll('.fpcAnalyticsSelected').length
document.querySelectorAll('.djs-bendpoint').length
document.querySelectorAll('.djs-segment-dragger').length
window.__PROCESSMAP_BUILD_INFO__
```

### Метрики

| Метрика | Before | After | Δ |
|---------|--------|-------|---|
| Idle long tasks / 10s | TBD | TBD | Must improve |
| Quick drag median duration | TBD | TBD | Must improve |
| Quick drag median long tasks | TBD | TBD | Must improve |
| Stress drag median duration | TBD | TBD | Must improve |
| Element drag median duration | TBD | TBD | Must improve |
| Tab switch Diagram time | TBD | TBD | Must improve |

**Критерий успеха:** материальное улучшение, а не просто прохождение сборки. Если метрики в пределах шума — контур НЕ завершён.

## Source Map Targets

### God-files (decomposition-first обязателен при изменении)

| Файл | Строки | Подозрение |
|------|--------|------------|
| `frontend/src/components/ProcessStage.jsx` | 6880 | Основной orchestrator; десятки useEffect/useMemo; нестабильные объекты в пропсах |
| `frontend/src/components/process/BpmnStage.jsx` | 5813 | 20+ useEffect; нестабильные адаптеры; selectedElement sync |
| `frontend/src/components/App.jsx` | ~3500+ | Корневое состояние прокидывается вниз по цепочке |

### Хуки / контроллеры

| Файл | Подозрение |
|------|------------|
| `frontend/src/components/process/interview/useInterviewDerivedState.js` | 40+ useMemo на каждый render |
| `frontend/src/features/process/stage/orchestration/state/useProcessStageLocalState.js` | Объединяет 4 sub-states без memo boundaries |
| `frontend/src/features/process/stage/controllers/useProcessStageShellController.js` | Пересчёт view model на каждый render |
| `frontend/src/features/process/stage/presence/useSessionPresence.js` | Polling каждые 45s; вызывает setState |
| `frontend/src/features/appUpdate/useAppUpdateAvailable.js` | Polling каждые 120s |

### UI / панели

| Файл | Подозрение |
|------|------------|
| `frontend/src/components/NotesPanel.jsx` | 3000+ строк; selectedElement меняется → сотни useMemo |
| `frontend/src/components/sidebar/ElementSettingsControls.jsx` | Property panel; пересчёт при selection |
| `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx` | Toolbar; пересчёт undo/redo |
| `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx` | 1700+ строк; diagram action tabs |

### События / drag

| Файл | Подозрение |
|------|------------|
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | `canvas.viewbox.changed`, `commandStack.changed` → callback storms |
| `frontend/src/features/process/bpmn/stage/interaction/diagramDragSideEffectGuard.js` | Guard существует, но родительские rerenders всё ещё дороги |

## Hypotheses

Agent 2 должен протестировать и ранжировать с доказательствами:

**H1. ProcessStage re-renders continuously and drags Diagram with it.**
- Доказательство: React DevTools Profiler render counters.

**H2. useProcessTabs or interview projection causes baseline long tasks.**
- Доказательство: profiler flame graph / function stacks.

**H3. Polling/auth/presence/version requests trigger expensive React shell rerender.**
- Доказательство: корреляция network с commits/long tasks.

**H4. Property panel or selected-element sync re-renders during drag.**
- Доказательство: counters / profiler.

**H5. Toolbar/discussions/search/focus controls re-render during drag.**
- Доказательство: counters / profiler.

**H6. Version/update ledger adds render churn.**
- Доказательство: изоляция компонента version badge.

**H7. BpmnStage props are unstable; memo boundaries are ineffective.**
- Доказательство: `Why did you render` или ручной audit dependency arrays.

**H8. React baseline jank is from large object identity churn.**
- Доказательство: анализ identity изменений в пропсах ProcessStage → BpmnStage.

**H9. Remaining lag is browser/SVG after React is optimized.**
- Доказательство: если React optimized до <10% CPU, а lag остаётся → SVG bottleneck.

## Decomposition-First Plan

Если Agent 2 касается ProcessStage или BpmnStage:

1. **Не добавлять** новую логику напрямую в god-file.
2. **Извлечь** подсистему в отдельный модуль:
   - Пример: `useProcessStageRenderOptimizer.js` — граница memo/stable props.
   - Пример: `BpmnStageStablePropsBoundary.jsx` — обёртка с `React.memo` + deep comparison.
3. **Документировать** извлечение в `DECOMPOSITION_REPORT.md`.
4. **Сохранить** существующие тестовые контракты (snapshot tests для PropTypes/структуры).

## Bounded Fix Strategy

### Разрешено Agent 2

- Модифицировать frontend-файлы для fix React jank.
- Обновить version/update ledger.
- Добавить bounded render boundaries (`React.memo`, `useMemo`, stable refs).
- Извлечь модули из god-files.
- Добавить временные profiler counters (dev-only, gated).

### Запрещено Agent 2

- Модифицировать backend/schema/storage.
- Модифицировать Product Actions.
- Модифицировать RAG tooling.
- Модифицировать AG-UI.
- Устанавливать пакеты.
- Менять BPMN XML semantics.
- Deploy stage/prod.
- Commit/push/PR.

## Acceptance Criteria

1. [ ] Baseline измерен до кода (idle, drag, tab switch).
2. [ ] React profiler evidence идентифицировал доминирующий модуль/функцию.
3. [ ] Корневой источник jank задокументирован в `PROCESS_STAGE_JANK_ROOT_CAUSE.md`.
4. [ ] Bounded fix применён (memo boundaries, stable props, decomposition).
5. [ ] After-code измерен; материальное улучшение подтверждено.
6. [ ] Version row обновлён (v1.0.130 или v1.0.131).
7. [ ] Маркер версии не на canvas.
8. [ ] `build-info.json` и `window.__PROCESSMAP_BUILD_INFO__` валидны.
9. [ ] Нет PUT /bpmn от view-взаимодействий.
10. [ ] Нет PATCH /sessions от view-взаимодействий.
11. [ ] `EXEC_REPORT.md` написан на русском.
12. [ ] `READY_FOR_REVIEW` или `EXEC_BLOCKED.md` создан.

## Non-goals

- Миграция bpmn-js engine.
- Overlays refactoring.
- Product Actions изменения.
- RAG реализация.
- AG-UI изменения.
- Серверный read model.

## Agent 2 Execution Plan

1. Сохранить executor RAG preflight в `RAG_PREFLIGHT_EXECUTOR.md`.
2. Зафиксировать source/runtime truth.
3. Запустить baseline измерения (idle, drag, tab switch).
4. Профилировать React render tree (DevTools Profiler / Performance tab).
5. Ранжировать гипотезы H1–H9 с доказательствами.
6. Применить bounded fix:
   - memo boundaries;
   - stable props;
   - извлечение из god-files при необходимости.
7. Пересобрать frontend, перезапустить gateway.
8. Запустить after-code измерения.
9. Обновить version row.
10. Написать отчёты:
    - `EXEC_REPORT.md`
    - `BASELINE_REACT_JANK_PROFILE.md`
    - `REACT_RENDER_SOURCE_MAP.md`
    - `PROCESS_STAGE_JANK_ROOT_CAUSE.md`
    - `RUNTIME_BEFORE_AFTER.md`
    - `DECOMPOSITION_REPORT.md` (если применялось)
    - `IMPLEMENTATION_NOTES.md`
    - `NEXT_BOTTLENECK_DECISION.md` (если не решено)
    - `VERSION_UPDATE_LEDGER_PROOF.md`
    - `READY_FOR_REVIEW` или `EXEC_BLOCKED.md`

## Agent 3 Review Plan

1. Запустить reviewer GSD discipline.
2. Сохранить reviewer RAG preflight в `RAG_PREFLIGHT_REVIEWER.md`.
3. Независимо проверить source/runtime truth.
4. Проверить свежий 5180 build (curl -I, build-info.json, JS asset hash).
5. Открыть большую диаграмму без overlays.
6. Измерить idle baseline (10s).
7. Выполнить **реальный** mouse canvas drag quick/natural (≥3 attempts).
8. Выполнить stepped/stress drag (≥3 attempts).
9. Выполнить real element drag.
10. Проверить отсутствие PUT/PATCH от view-взаимодействий.
11. Сравнить before/after метрики.
12. **FAIL (CHANGES_REQUESTED)** если:
    - метрики в пределах шума;
    - user-visible lag остаётся без изменений;
    - нет точного следующего bottleneck;
    - нет real drag теста;
    - нет idle baseline;
    - нет version proof;
    - маркер на canvas.

## Risks

| Риск | Митигация |
|------|-----------|
| God-file decomposition ломает существующие тесты | Сохранить контракты props; не менять public API |
| React.memo ломает ref-based imperative API | Проверить `forwardRef` и imperative handle |
| Stable props требуют deep comparison — дорого | Использовать structural sharing / identity stabilizer |
| Polling нельзя отключить полностью (feature) | Batch setState; useTransition; reduce frequency |
| Version bump конфликтует с pre-existing v1.0.130 | Agent 2 проверяет текущую версию; bump to v1.0.131 если есть изменения |

## Gates

- [ ] GSD discipline recorded.
- [ ] RAG preflight saved (planner + reviewer).
- [ ] Source/runtime truth captured.
- [ ] Previous drag-hot-path non-improvement documented.
- [ ] React bundle 95% CPU finding documented.
- [ ] Agent 2 executor prompt written.
- [ ] Agent 3 reviewer prompt written.
- [ ] Version/update ledger plan documented.
- [ ] Measurement plan documented.
- [ ] Decomposition-first plan documented.
- [ ] STATE.json written.
- [ ] AGENT_RUN_ID written.
- [ ] READY_FOR_EXECUTION touched.
