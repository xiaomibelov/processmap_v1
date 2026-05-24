# fix/diagram-interaction-mode-visual-regression-v1

**Роль:** Agent 1 / Planner  
**Run ID:** 20260516T224839Z-35866  
**Дата:** 2026-05-16T22:50:00+00:00  
**Язык документации:** русский  
**Язык промптов Executor/Reviewer:** английский  

---

## GSD Discipline

```bash
cd /opt/processmap-test
echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*' 2>/dev/null | sort | head -50 || true
```

**Результат:**
- `PATH` содержит `/opt/processmap-test/bin`
- `gsd` → `/opt/processmap-test/bin/gsd`
- `gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
- `PROCESSMAP_GSD_WRAPPER_FOUND`
- `CODEX_GSD_TOOLS_FOUND`
- 50 GSD skills найдено

**Режим:** `GSD_PROCESSMAP_WRAPPER_PLANNING` — полный GSD доступен.

---

## RAG Preflight

- **Planner preflight:** выполнен. См. `RAG_PREFLIGHT_PLANNER.md`.
- **Reviewer preflight:** выполнен. См. `RAG_PREFLIGHT_REVIEWER.md`.

**Ключевые факты из RAG:**
- Предыдущие performance-контуры (`perf/diagram-svg-css-repaint-reduction-v1`, `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`) формально прошли REVIEW_PASS.
- Пользователь вручную подтвердил: «где-то на 10% плавнее», но появилась **новая визуальная регрессия**.
- RAG подтверждает: `filter: drop-shadow(...)` был убран/снижен правильно; CSS-оптимизации ценны и не должны слепо откатываться.
- Ручные отклонения пользователя требуют: реальный drag, маркер вне canvas, версия видима в footer.

---

## Source / Runtime Truth

| Параметр | Значение |
|----------|----------|
| `pwd` | `/opt/processmap-test` |
| `whoami` | `root` |
| `hostname` | `clearvestnic.ru` |
| `date -Is` | 2026-05-16T22:50:38+00:00 |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git diff --name-only` | 11 frontend-файлов + untracked |
| `git diff --stat` | 11 files changed, 125 insertions(+), 64 deletions(-) |
| `curl -s http://clearvestnic.ru:8088/health` | `{"ok":true,...}` |
| `curl -I http://clearvestnic.ru:5180` | HTTP/1.1 200 OK, no-cache |
| `build-info.json` | `v1.0.132`, `contourId: perf/diagram-human-perceived-pan-and-drag-smoothness-v1` |

**Примечание:** diff содержит изменения из предыдущего контура `perf/diagram-human-perceived-pan-and-drag-smoothness-v1` и смежных контуров. Это ожидаемо — ветка `fix/lockfile-sync-test` накопительная для серии diagram-фиксов.

---

## User Visual Regression Report

Пользователь вручную сообщил о новой визуальной регрессии после контура `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`:

1. **BPMN-задачи выглядят неправильно:**
   - заливка задач стала серой вместо ожидаемой чистой белой/светлой;
   - текст стал слишком жирным/тяжёлым;
   - общий вид задач неприятен и не соответствует предыдущему BPMN-стилю.

2. **Во время pan/drag canvas:**
   - задачи становятся белыми при удержании левой кнопки мыши;
   - пользователь не может легко сделать скриншот, потому что кнопка мыши должна быть зажата;
   - визуальное переключение во время взаимодействия выглядит неправильно и лишним.

3. **Ожидания пользователя:**
   - BPMN-элементы должны сохранять стабильный, чистый, читаемый визуальный стиль;
   - interaction-mode не должен инвертировать или радикально менять цвета задач;
   - оптимизация pan/drag не должна создавать видимый color flash;
   - типографика задач не должна становиться излишне жирной;
   - визуальный дизайн должен быть исправлен без возврата lag.

---

## Previous Smoothness Contour Result

**Контур:** `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`  
**Вердикт:** REVIEW_PASS (с замечанием по element-drag interaction mode)  
**Версия:** v1.0.132

**Что было сделано:**
- Введён `.fpcDiagramInteracting` — CSS-класс на `.djs-container` во время active pointer-взаимодействия.
- Базовое правило: `.bpmnCanvas .djs-container .viewport { filter: brightness(.88) contrast(.96); }`
- Interaction-override: `.djs-container.fpcDiagramInteracting .viewport { filter: none; will-change: transform; }`
- Дополнительно: `shape-rendering: crispEdges !important` для `.fpcDiagramInteracting .djs-visual *` в `02-06-bpmn-dark-theme.css`.
- Подавлен `applyPropertiesOverlayDecorForZoomChange` во время canvas-pan.

**Замечание Reviewer:**
- `.fpcDiagramInteracting` НЕ активируется при element drag (bpmn-js eventBus перехватывает события).
- Synthetic frame pacing не показал радикального сдвига — улучшение в paint/composite фазе.

**Связь с текущей регрессией:**
- `filter: brightness(.88) contrast(.96)` на viewport делает задачи серыми в нормальном состоянии.
- При `fpcDiagramInteracting` filter снимается → задачи вспыхивают белым во время pan.
- `shape-rendering: crispEdges !important` может влиять на рендеринг текста (жирность/чёткость).
- `will-change: transform` + filter toggle создаёт видимый style jump.

---

## Problem Statement

Визуальная регрессия в BPMN-диаграмме, вызванная CSS interaction-mode из контура производительности:

- **Серый fill** задач в нормальном состоянии — побочный эффект `brightness(.88) contrast(.96)`.
- **Белый flash** задач во время pan — побочный эффект `filter: none` в `.fpcDiagramInteracting`.
- **Жирный/тяжёлый текст** — возможно, `shape-rendering: crispEdges !important` или изменение контраста.
- **Style jump** — переключение filter между состояниями заметно глазу.

**Это не performance-контур.** Нужно исправить визуальный стиль, сохранив производительность.

---

## Source Map Targets

**Найдено grep-ом:**

### `.fpcDiagramInteracting` и связанные правила
- `frontend/src/styles/legacy/legacy_bpmn.css:43-45` — `.fpcDiagramInteracting .viewport` rules
- `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css:66-70` — `shape-rendering: crispEdges !important` для `.fpcDiagramInteracting .djs-visual *`
- `frontend/src/styles/app/06-final-structure.css:169-171` — interaction-mode filter removal + will-change
- `frontend/src/features/process/bpmn/stage/interaction/diagramInteractionMode.js` — toggler класса
- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` — интеграция

### Фильтры / тени / шрифты
- `frontend/src/styles/tailwind.css` — множество `font-weight`, `box-shadow`, `filter`, `opacity`, `transition`
- `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css` — тёмная тема BPMN
- `frontend/src/styles/legacy/legacy_bpmn.css` — legacy BPMN стили

### BPMN-специфичные селекторы
- `.djs-shape`, `.djs-visual`, `.bpmnCanvas`, `.djs-container`, `.viewport`
- `.fpcAnalyticsSelected`, `.fpcFocusDim`
- `fill:`, `stroke:`, `font-weight` в tailwind и темах

**Ожидаемые цели:**
- `legacy_bpmn.css` — правило viewport filter.
- `02-06-bpmn-dark-theme.css` — `shape-rendering` и тёмная тема.
- `06-final-structure.css` — interaction-mode override.
- `tailwind.css` — возможные font-weight / fill overrides для BPMN-элементов.
- `diagramInteractionMode.js` — если JS-toggle сам по себе корректен, не трогать.
- `wireBpmnStageRuntimeEvents.js` — guard side effects, не трогать (performance).

---

## Hypotheses

| ID | Гипотеза | Вероятность |
|----|----------|-------------|
| H1 | `.fpcDiagramInteracting` снимает filter, но базовый `brightness(.88) contrast(.96)` делает задачи серыми в норме. | Высокая |
| H2 | `shape-rendering: crispEdges !important` в interaction mode делает текст жирнее/чётче некомфортно. | Средняя |
| H3 | `filter: none` во время interaction убирает не только "тяжесть", но и intentional dark-theme adjustments, вызывая белый flash. | Высокая |
| H4 | Правило `brightness(.88) contrast(.96)` было добавлено для dark theme, но в light theme оно делает задачи серыми. | Средняя |
| H5 | CSS specificity в `06-final-structure.css` или `legacy_bpmn.css` override'ит корректные BPMN-стили bpmn-js. | Средняя |
| H6 | Исправление может быть CSS-only: скорректировать базовый filter и interaction override так, чтобы не было flash и серости. | Высокая |
| H7 | `font-weight` для BPMN-меток переопределён где-то в tailwind или теме, не связано напрямую с interaction mode. | Низкая |
| H8 | `.fpcDiagramInteracting` применяется слишком широко (весь viewport), а не только к canvas layer. | Низкая |

---

## Bounded Fix Strategy

**Границы контура (strictly in scope):**
1. Исправить визуальный стиль BPMN-задач в нормальном (не-interacting) состоянии:
   - убрать нежелательный серый fill;
   - восстановить чистый белый/светлый стиль задач;
   - убрать избыточную жирность текста.
2. Исправить визуальный стиль во время canvas pan/drag:
   - убрать белый flash/резкое переключение;
   - interaction mode не должен радикально менять цвета задач;
   - сохранить плавность (no heavy filter recompositing).
3. Сохранить все предыдущие performance-улучшения:
   - не удалять `will-change: transform`;
   - не возвращать expensive drop-shadow filters;
   - не отключать guard `applyPropertiesOverlayDecorForZoomChange`;
   - не трогать `diagramInteractionMode.js` логику toggle (если она корректна).
4. Обновить версию:
   - v1.0.132 → v1.0.133 (или canonical next);
   - footer видим, маркер не на canvas;
   - `build-info.json` + `window.__PROCESSMAP_BUILD_INFO__` валидны.

**Strictly out of scope:**
- Backend changes.
- Product Actions / RAG / AG-UI.
- BPMN XML mutation.
- Package install.
- Новые JS-модули (если не CSS-only fix).
- Merge / deploy / PR.
- Element drag interaction mode gap (это отдельный контур).

**Предпочтительный путь:**
- **CSS-only fix** в первую очередь.
- Если CSS-only недостаточно — минимальный JS-tweak (например, скорректировать threshold или класс).

---

## Version / Update Ledger Plan

- **Текущая:** v1.0.132 (`perf/diagram-human-perceived-pan-and-drag-smoothness-v1`)
- **Целевая:** v1.0.133
- **Место:** `frontend/src/config/appVersion.js`
- **Текст changelog (русский):** «Исправлена визуальная регрессия BPMN-задач: восстановлен чистый стиль fill/stroke/текста, убран белый flash при pan/drag.»
- **Footer:** строка «Версия v1.0.133 · ...» видима.
- **Маркер:** НЕ на canvas.
- **build-info.json:** валиден, `dirty: true` (ок для dev-ветки).

---

## Validation Plan

### Agent 2 (Executor) должен:
1. Открыть свежий 5180, проект `wewe` / «Описание процессов Долгопрудный», overlays OFF.
2. Сделать **before** скриншоты: нормальное состояние задач, zoom на задачу.
3. Замерить computed styles: `fill`, `stroke`, `font-weight`, `filter` для `.djs-shape` / `.djs-visual` / текстовых `<text>`.
4. Зажать левую кнопку и pan — зафиксировать computed styles во время `.fpcDiagramInteracting`.
5. Отпустить — зафиксировать after pointerup.
6. Применить CSS-fix, пересобрать (Docker frontend container).
7. Повторить замеры — **after** скриншоты и computed styles.
8. Зафиксировать: версия v1.0.133, маркер не на canvas, console errors: 0.

### Agent 3 (Reviewer) должен:
1. Независимо открыть 5180, сверить версию.
2. Визуально проверить: задачи не серые, текст не жирный.
3. Реальный canvas pan — проверить отсутствие белого flash.
4. pointerup — проверить стабильность стиля.
5. Light / dark theme — проверить читаемость.
6. No PUT/PATCH during view pan.
7. Console errors: 0.
8. Сделать скриншоты before/after (если возможно, через Playwright или описание).

---

## Acceptance Criteria

Agent 3 может выставить REVIEW_PASS только если:

1. GSD discipline использована.
2. RAG review context существует.
3. Fresh 5180 proof есть.
4. Версия инкрементирована до canonical next.
5. Маркер не на canvas.
6. **Default task style исправлен:**
   - нет нежелательного серого fill;
   - нет избыточной жирности labels;
   - читаемый текст;
   - стабильный stroke/fill.
7. **Во время canvas pan/drag:**
   - задачи не вспыхивают/не меняются на белый стиль;
   - interaction mode не вызывает видимый style jump;
   - performance protection остаётся активным.
8. **После pointerup:**
   - стиль стабильно восстанавливается корректно.
9. Light/dark theme проверены (если применимо).
10. Large no-overlays Diagram протестирован.
11. No PUT/PATCH during view pan.
12. No console errors.
13. No Product Actions / RAG / backend changes.
14. No package install.
15. Build/tests проходят.
16. Screenshot или visual evidence приложен/описан before/after.
17. Reviewer выполнил реальную browser visual check, не только source review.

**No REVIEW_PASS если:**
- задачи всё ещё серые/тяжёлые;
- labels остаются излишне жирными;
- задачи всё ещё визуально вспыхивают при pan;
- performance fix слепо удалён;
- проверена только source/build.

---

## Non-goals

- Не переписывать engine диаграммы.
- Не добавлять новые JS-модули (если не требуется).
- Не менять логику selection/hover/analytics (это отдельные контуры).
- Не исправлять element-drag interaction mode gap (уже задокументировано, отдельный контур).
- Не merge в main без явного approval пользователя.

---

## Agent 2 Execution Plan

См. `EXECUTOR_PROMPT.md`.

Кратко:
- Прочитать PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md.
- Запустить executor RAG preflight.
- Сделать before скриншоты / computed styles.
- Найти точный CSS source регрессии.
- Применить bounded CSS fix.
- Сохранить interaction performance protections.
- Обновить версию до v1.0.133.
- Сделать after скриншоты / computed styles.
- Написать EXEC_REPORT.md и сопутствующие отчёты.
- Создать `READY_FOR_REVIEW`.

---

## Agent 3 Review Plan

См. `REVIEWER_PROMPT.md`.

Кратко:
- Прочитать PLAN.md, EXEC_REPORT.md.
- Запустить reviewer RAG preflight.
- Верифицировать свежий 5180.
- Верифицировать версию в footer.
- Визуально проверить default task visuals.
- Визуально проверить task visuals во время canvas pan/drag.
- Проверить after pointerup.
- Проверить no style flash / regression.
- Проверить no PUT/PATCH during view pan.
- Проверить no console errors.
- Выставить REVIEW_PASS только если визуальная проблема действительно исправлена.

---

## Risks

| Риск | Оценка | Митигация |
|------|--------|-----------|
| CSS-only fix не решает полностью | Средняя | Запасной план: минимальный JS-tweak класса/порога. |
| Исправление одной темы ломает другую | Средняя | Проверить light и dark theme. |
| Возврат к "чистому" стилю reintroduce expensive filters | Низкая | Не возвращать drop-shadow; использовать stroke/fill только. |
| Build OOM в хосте | Средняя | Собирать в Docker frontend container. |
| User rejection: «всё ещё не так» | Средняя | Точное следование user report: gray fill, bold text, white flash. |

---

## Gates

- [x] GSD discipline recorded
- [x] Source/runtime truth captured
- [x] RAG preflight (planner + reviewer) completed
- [x] Previous contour reports reviewed
- [x] Source map targets identified
- [x] Hypotheses documented
- [x] Bounded scope defined
- [x] Acceptance criteria defined
- [x] Agent 2 prompt written
- [x] Agent 3 prompt written
- [x] STATE.json written
- [x] AGENT_RUN_ID written
- [x] READY_FOR_EXECUTION touched
- [ ] Agent 2 execution completed
- [ ] Agent 3 review completed
- [ ] REVIEW_PASS or REWORK issued
