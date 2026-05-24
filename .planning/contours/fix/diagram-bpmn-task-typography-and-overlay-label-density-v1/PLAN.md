# fix/diagram-bpmn-task-typography-and-overlay-label-density-v1

## GSD Discipline

**Команды, выполненные планировщиком:**

```bash
cd /opt/processmap-test
echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*' 2>/dev/null | sort | head -50 || true
```

**Результаты:**
- `gsd` → `/opt/processmap-test/bin/gsd` ✅
- `gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk` ✅
- `PROCESSMAP_GSD_WRAPPER_FOUND` ✅
- `CODEX_GSD_TOOLS_FOUND` ✅
- 50+ GSD-скиллов найдено (`gsd-plan-phase`, `gsd-execute-phase`, `gsd-code-review`, и др.) ✅

**Режим GSD:** `GSD_PROCESSMAP_WRAPPER_PLANNING` — полный GSD доступен.

**Подтверждения:**
- Никакая реализация (product code) планировщиком не выполнялась.
- Product-файлы (frontend/src/, backend/app/) не изменялись.
- Все действия ограничены чтением, сбором фактов и записью артефактов планирования в `.planning/contours/`.

---

## RAG Preflight

**Выполненные команды:**

```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "fix/diagram-bpmn-task-typography-and-overlay-label-density-v1" \
  --area "Diagram BPMN task typography font weight label density property chips visual clutter CSS theme interaction mode" \
  --format md \
  --top-k 12

node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "fix/diagram-bpmn-task-typography-and-overlay-label-density-v1" \
  --query "Diagram visual regression review rules BPMN task font-weight typography label density no performance regression" \
  --format md \
  --top-k 12
```

**Файлы:**
- `RAG_PREFLIGHT_PLANNER.md` — сохранён в этом контуре.
- `RAG_PREFLIGHT_REVIEWER.md` — сохранён в этом контуре.

**Ключевые факты из RAG:**
1. Предыдущие performance-контуры (`perf/diagram-svg-css-repaint-reduction-v1`) уже удалили ~43 drop-shadow правила. Этот контур **не должен** возвращать тяжёлые фильтры.
2. property overlay CSS (`fpcPropertyOverlay`, `fpcNodeBadge`) использует высокий `font-weight: 700` и яркие цвета — это подтверждает необходимость проверки плотности chip-лейблов.
3. `bpmn-js` внутренние стили + наши override'ы в `05-02-bpmn-text-contrast.css` и `02-06-bpmn-dark-theme.css` отвечают за видимость текста.
4. Пользовательские отклонения (user rejections) напоминают: формальный REVIEW_PASS ≠ решённая проблема. Agent 3 должен проверять реальный runtime и реальный визуальный результат.
5. Маркер версии должен быть **вне canvas**. Версия должна инкрементироваться видимо.

**Как RAG изменил план:**
- Усилил акцент на "не возвращать drop-shadow".
- Добавил проверку chip-density как второстепенную, но обязательную.
- Подтвердил, что bounded CSS-only fix — правильная стратегия.

---

## Source / Runtime Truth

**Среда:**

| Параметр | Значение |
|----------|----------|
| `pwd` | `/opt/processmap-test` |
| `whoami` | `root` |
| `hostname` | `clearvestnic.ru` |
| `date -Is` | 2026-05-16T23:37:50+00:00 |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git diff --name-only` | 12 файлов (накопленные изменения предыдущих контуров) |
| `git diff --stat` | 12 files changed, 116 insertions(+), 68 deletions(-) |
| `curl -s :8088/health` | `{"ok":true,...}` |
| `curl -I :5180` | HTTP/1.1 200 OK, `Cache-Control: no-cache, no-store, must-revalidate` |
| `build-info.json` | `v1.0.133`, contour `fix/diagram-interaction-mode-visual-regression-v1`, sha `5b20bc2`, dirty=true |

**Версия в коде:**
- `frontend/src/config/appVersion.js`: `currentVersion: "v1.0.133"`
- `frontend/src/generated/buildInfo.js`: `PROCESSMAP_BUILD_INFO` с `shaShort: "5b20bc2"`

**Нет дивергенций** между HEAD и build-info.json. Runtime 5180 активен и отдаёт no-cache.

---

## User Visual Observation

Пользователь вручную проверил UI после контура `fix/diagram-interaction-mode-visual-regression-v1` (v1.0.133) и сообщил:

- **"Стало лучше."** — визуальная регрессия fill/flash частично исправлена.
- **Текст BPMN-задач всё ещё слишком визуально тяжёлый.**
- **Текст должен быть нормальным / читаемым, но не сильно жирным.**
- **Должен быть чуть крупнее, чем слишком-мелкий, но не тяжёлый.**
- **Текущий шрифт "сильно выделяется" на диаграмме.**
- **Нужно скорректировать UX/UI типографику, а не откатывать performance-фиксы.**
- **На скриншоте видны BPMN-задачи с жирными лейблами и множеством цветных overlay-чипов / property-лейблов.**

**Формальная интерпретация:**

| Поле | Значение |
|------|----------|
| `formal_verdict` | REVIEW_PASS (предыдущего контура) |
| `user_visible_result` | partially_solved |
| `remaining_issue` | BPMN task typography too bold / visually dominant |
| `secondary_issue_to_check` | overlay / property chip label density and visual clutter |
| `next_action` | bounded typography / density visual fix |

---

## Previous Visual Regression Result

**Контур:** `fix/diagram-interaction-mode-visual-regression-v1`
- **Вердикт:** REVIEW_PASS
- **Версия:** v1.0.133
- **Что исправлено:**
  - Заливка задач восстановлена до белой (`rgba(255,255,255,0.92)`).
  - Убран серый fill.
  - Убран базовый `filter: brightness(.88) contrast(.96)` на viewport.
  - Убран белый flash при pan/drag.
  - `will-change: transform` сохранён.

**Что осталось:**
- Типографика лейблов задач всё ещё воспринимается пользователем как "жирная" / "тяжёлая".
- Расхождение в отчётах предыдущего контура:
  - **Agent 2 (EXEC_REPORT):** `text font-weight: 700` — "Expected for label outline effect (paint-order stroke fill)"
  - **Agent 4 (REVIEW_REPORT):** `text font-weight: 600` — "Не избыточно жирный (было 700 до фикса)"
  - **Вывод:** вероятно, измерялись разные элементы или состояния. Необходимо точное измерение computed styles именно для текста задач (`.djs-shape` task `.djs-label`).

**Ограничения:**
- Не откатывать performance-улучшения (filter removal, will-change, overlay suppression).
- Не возвращать drop-shadow на задачи.
- Не нарушать светлую/тёмную тему.

---

## Problem Statement

1. BPMN-лейблы задач визуально доминируют над диаграммой.
2. Пользователь воспринимает их как "жирные" / "сильно выделяющиеся".
3. Требуется нормализация типографики: уменьшить визуальный вес текста, сохранив читаемость.
4. Вторично: проверить, не усиливают ли визуальный шум цветные property-чипы / overlay-лейблы.

---

## Source Map Targets

### Кандидат-файлы (точные строки из codebase)

**A. `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`**
- Строки 62–91: CSS-переменные тёмной темы, включая `--bpmn-task-text: rgba(240, 247, 255, 0.95)`.
- Строки 165–174: **Pool/Lane лейблы** с `font-weight: 700 !important`, `paint-order: stroke fill`, `stroke-width: 2px`. Не задачи, но показатель стиля.
- Строки 182–186: `.fpcTaskLightBg .djs-label` и `text` — `font-weight: 600 !important`. Это явный override для задач с классом `fpcTaskLightBg`.
- Строки 419–512: `.fpcNodeBadge`, `.fpcNodeBadgeCount` — `font-weight: 700–800`, яркие цвета, box-shadow. **Источник визуального шума чипов.**
- Строки 604–745: `.fpcPropertyOverlay`, `.fpcPropertyRow` — `font-weight: 600–720`, плотная сетка, яркие акцентные границы.
- Строки 752–790: `.fpcNodeFlashPill` — `font-weight: 700`, анимация fade.

**B. `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css`**
- Строки 53–57: `.bpmnStage .djs-label, .bpmnStage .djs-visual text` — `fill: rgba(255,255,255,0.86) !important`. Нет явного `font-weight`, но `!important` на fill повышает контраст.
- Строки 103–106: дублирующийся селектор с тем же fill.
- Строки 287–290: `.bpmnCanvas text, .bpmnCanvas .djs-label` — `fill: rgba(255,255,255,.84) !important`.
- Строки 319–322: `.bpmnCanvas text, .bpmnCanvas .djs-label` — `fill: rgba(255,255,255,.86) !important`.
- Строки 66–72: `.fpcDiagramInteracting .djs-visual *` — `shape-rendering: crispEdges !important`. Не влияет на text (text не в списке), но создаёт микро-jump фигур.

**C. `frontend/src/styles/app/06-final-structure.css`**
- Строки 164–168: `.fpcDiagramInteracting .bpmnCanvas .viewport` — `will-change: transform`. Сохранить.

**D. `frontend/src/styles/legacy/legacy_bpmn.css`**
- Строки 38–42: `.fpcDiagramInteracting .viewport` — `will-change: transform`. Сохранить.
- Импорты: `02-02-bpmn-viewer-core.css`, `02-06-bpmn-dark-theme.css`, `04-03-llm-bottlenecks.css`, `05-02-bpmn-text-contrast.css`.

**E. bpmn-js внутренние стили (вне src/, в runtime)**
- Возможно, bpmn-js renderer выставляет SVG-атрибут `font-weight="bold"` или inline `font-weight: 500` на `<text>`.
- Необходимо проверить computed styles в runtime, а не только source CSS.

### Предполагаемые источники тяжести текста
1. **bpmn-js default + наши override'ы:** совокупный эффект высокого контраста (`fill: rgba(255,255,255,0.86) !important` на тёмном canvas) и возможного `font-weight: 500–700` от renderer.
2. **paint-order + stroke:** если bpmn-js или другой CSS применяет `paint-order: stroke fill` к лейблам задач (не только Pool/Lane), это визуально утолщает буквы.
3. **Отсутствие calming-правила для обычных задач:** явный `font-weight: 600` есть только для `.fpcTaskLightBg`. Обычные задачи (`bpmn:Task` без доп. класса) могут наследовать более жирный вес.

### Предполагаемые источники шума чипов
1. `.fpcNodeBadge` — `font-weight: 700`, `font-size: 9.5px`, яркий box-shadow.
2. `.fpcPropertyRow` — `font-weight: 600–720`, плотная сетка с цветными левыми границами.
3. Высокая плотство чипов на dense-диаграммах создаёт "мозаичный" эффект.

### Границы безопасных изменений
- Только CSS.
- Только файлы стилей BPMN / диаграммы.
- Не трогать `wireBpmnStageRuntimeEvents.js`, `diagramInteractionMode.js`, overlay data-логику.
- Не удалять чипы, только возможная нормализация `font-weight` / `opacity` / `box-shadow`.

### Риски
- Слишком сильное снижение веса сделает текст нечитаемым на тёмном canvas.
- Изменение `!important` fill может сломать светлую тему.
- Уменьшение shadow чипов может сделать их незаметными.

---

## Hypotheses

**H1.** BPMN-лейблы задач имеют избыточный `font-weight` override после последних CSS-изменений (или унаследовали его от bpmn-js renderer).

**H2.** Текст кажется тяжелее из-за комбинации высокого контраста (`fill: rgba(255,255,255,0.86)`) и возможного `text-shadow` / `stroke` эффекта, а не только из-за `font-weight`.

**H3.** Размер шрифта (`~12px`) приемлем, но вес / контраст слишком агрессивны.

**H4.** CSS interaction-mode (`.fpcDiagramInteracting`) не должен влиять на вес текста, но нужно проверить, что pan не меняет типографику.

**H5.** Property-чипы визуально захламляют диаграмму, потому что их `font-weight`, `border`, `fill` и `box-shadow` слишком выразительны.

**H6.** Плотность чипов — отдельная проблема; если безопасного bounded-фикса нет, задокументировать как follow-up.

**H7.** Корректный фикс — CSS-only, без изменений JS / React / BPMN XML.

**H8.** Изменения должны сохранять читаемость в светлой и тёмной темах.

---

## Bounded Fix Strategy

Agent 2 должен предпочесть **наименьший безопасный CSS-фикс**.

**Направления:**
1. **Нормализовать `font-weight` лейблов задач:**
   - Если computed style показывает `font-weight: 700` на обычных задачах (`.djs-shape` task `.djs-label`) — добавить override с более спокойным значением (`400–500`).
   - Если bpmn-js выставляет `font-weight="bold"` inline — перекрыть через CSS селектор высокой специфичности (`!important` при необходимости, но осторожно).
   - Для `.fpcTaskLightBg` (строка 185): `font-weight: 600` возможно уже достаточно спокоен, но проверить в runtime.

2. **Снизить агрессивность контраста текста (опционально, если H2 подтверждена):**
   - Тонкая корректировка `--bpmn-task-text` opacity (например, с `0.95` до `0.88–0.90`) может уменьшить "выцветание" без потери читаемости.
   - Или добавить `font-weight: 400` с чуть более светлым fill.

3. **Проверить `paint-order` / `stroke` на лейблах задач:**
   - В `05-02-bpmn-text-contrast.css` `paint-order: stroke fill` применён только к Pool/Lane (строки 170–173).
   - Если bpmn-js или другой файл добавляет stroke к лейблам задач — это может быть источником визуальной тяжести.

4. **Опциональная нормализация чипов (только если очевидно безопасно):**
   - `.fpcNodeBadge`: `font-weight: 700` → `600` или `650`.
   - `.fpcNodeBadge`: уменьшить `box-shadow` или `opacity` слегка.
   - `.fpcPropertyRow`: `font-weight: 600` → `500`.
   - **Если риск регрессии visibility высок — оставить без изменений и задокументировать.**

**Запрещено:**
- Широкий редизайн BPMN-темы.
- Удаление property-чипов или overlay-логики.
- Изменение BPMN-семантики.
- Изменение Product Actions / данных overlay.
- Возврат heavy drop-shadow / filter.
- Слом предыдущих performance-фиксов.

---

## Version / Update Ledger Plan

Agent 2 должен:
- Инкрементировать видимую версию: **v1.0.133 → v1.0.134**.
- Обновить `frontend/src/config/appVersion.js`:
  - `currentVersion: "v1.0.134"`
  - Новая запись в `changelog` (первая в массиве) на русском:
    - "Нормализована типографика лейблов BPMN-задач: уменьшен визуальный вес текста, сохранена читаемость."
    - "Проверена плотность property-чипов на диаграмме."
    - "Сохранена стабильность interaction-mode (белый flash отсутствует)."
- Обновить / пересобрать `build-info.json`:
  - `contourId: "fix/diagram-bpmn-task-typography-and-overlay-label-density-v1"`
  - `timestamp` свежий
  - `shaShort` из текущего HEAD
- Убедиться, что `window.__PROCESSMAP_BUILD_INFO__` валиден.
- **Маркер версии должен быть в footer, НЕ на canvas.**

Agent 3 должен **забраковать review**, если:
- версия отсутствует в footer;
- маркер на canvas;
- build-info.json не совпадает с ожидаемым.

---

## Validation Plan

Agent 2 должен выполнить до и после фикса.

### A. Свежий runtime / версия
- Открыть `http://clearvestnic.ru:5180/?cb=<timestamp>` в свежем browser context.
- Проверить `build-info.json`: v1.0.134, contourId корректный.
- Проверить footer: **Версия v1.0.134**.
- Убедиться, что маркер версии НЕ на canvas.

### B. Визуальная проверка задач (normal state)
- Открыть большую диаграмму (проект `wewe`, сессия с overlays ON и OFF).
- Инспектировать computed styles лейбла задачи (`.djs-shape` task `.djs-label`):
  - `font-weight`
  - `font-size`
  - `fill` / `color`
  - `text-shadow`, `filter`, `stroke` (если применяются)
- Зафиксировать скриншот.
- Убедиться, что текст читаемый, но не "жирный-жирный".

### C. Interaction mode (pan / drag)
- Зажать ЛКМ на пустом canvas и сдвинуть.
- Проверить, что `.fpcDiagramInteracting` активен.
- Убедиться, что `font-weight` / `fill` текста задач **не меняются** во время pan.
- Белого flash НЕТ.
- Style jump НЕТ.

### D. После pointerup
- `.fpcDiagramInteracting` снят.
- Стили задач стабильны.
- Нет "застрявшего" класса.

### E. Overlay / chip density
- Включить overlays (`Слои ON`), если доступно.
- Оценить визуальный шум от чипов.
- Если чипы были изменены — зафиксировать before/after.
- Если не изменены — задокументировать наблюдение.

### F. Performance safety
- Во время pan: **0 PUT /bpmn**, **0 PATCH /sessions**.
- Console errors: **0**.
- Нет явной регрессии плавности pan.

### G. Сборка / тесты
- `npm run build` (или эквивалент) проходит без ошибок.
- Релевантные тесты проходят (или только pre-existing failures).

### Обязательные артефакты
- `TYPOGRAPHY_VISUAL_BASELINE.md` — computed styles before.
- `TASK_LABEL_COMPUTED_STYLE_ANALYSIS.md` — анализ точных значений.
- `CSS_SOURCE_MAP.md` — какие правила и файлы изменены.
- `INTERACTION_STATE_STYLE_ANALYSIS.md` — стили во время/после pan.
- `OVERLAY_CHIP_DENSITY_CHECK.md` — оценка чипов.
- `VISUAL_BEFORE_AFTER.md` — скриншоты + описание.
- `VERSION_UPDATE_LEDGER_PROOF.md` — proof версии.
- `RUNTIME_BEFORE_AFTER.md` — runtime proof.
- `IMPLEMENTATION_NOTES.md` — что и почему изменено.

---

## Acceptance Criteria

Agent 3 может выставить REVIEW_PASS **только если** выполнены ВСЕ пункты:

1. GSD discipline использована.
2. RAG review context существует.
3. Fresh 5180 proof собран.
4. Версия/update row инкрементирована (v1.0.134).
5. Маркер **не на canvas**.
6. Текст BPMN-задач по умолчанию **больше не воспринимается как excessively bold/heavy**.
7. Текст остаётся читаемым и не слишком мелким.
8. Заливка задач остаётся стабильно белой / светлой, не серой.
9. Во время pan/drag заливка / текст задач **не прыгают / не меняются** визуально.
10. Белого flash при pan **нет**.
11. Performance-защиты (will-change, suppression) **сохранены**.
12. Property-чипы проверены на визуальную плотность.
13. Во время view pan: **0 PUT /bpmn**, **0 PATCH /sessions**.
14. Console errors: **0**.
15. **Нет** изменений Product Actions / RAG / backend.
16. **Нет** установки пакетов.
17. Сборка / тесты проходят.
18. Есть visual before/after evidence.
19. Reviewer выполнил **реальную browser visual check**, а не только source-review.

**Нет REVIEW_PASS, если:**
- Лейблы задач всё ещё выглядят слишком жирными / тяжёлыми.
- Текст стал слишком мелким / нечитаемым.
- Задачи мигают / меняют стиль при pan.
- Вернулась предыдущая регрессия fill/flash.
- Performance-фикс слепо удалён.
- Проверена только сборка / исходники.

---

## Non-goals

- Это **не** контур архитектуры performance.
- Это **не** контур новой фичи Product Actions.
- Это **не** контур RAG-инструментов.
- Это **не** семантический BPMN-контур.
- Не редизайнить всю тему диаграммы.
- Не удалять property overlay / chip-логику.
- Не менять данные overlay (что показывается), только возможные CSS-стили (как показывается).
- Не вводить новые зависимости или пакеты.
- Не мержить, деплоить, создавать PR.

---

## Agent 2 Execution Plan

Agent 2 (Executor) должен выполнить:

1. **Подготовка**
   - Прочитать PLAN.md, STATE.json, предыдущие REVIEW_REPORT.md / EXEC_REPORT.md.
   - Запустить executor RAG preflight: `node tools/rag/pm-rag-agent-preflight.mjs --role executor ...`
   - Зафиксировать source/runtime truth.

2. **Baseline (до кода)**
   - Открыть свежий 5180, проект `wewe`, диаграмму.
   - Сделать скриншот задач (normal state).
   - Снять computed styles для `.djs-shape` task `.djs-label`:
     - `font-weight`, `font-size`, `fill`, `stroke`, `paint-order`, `text-shadow`, `filter`.
   - Проверить interaction mode: computed styles до/во время/после pan.
   - Записать `TYPOGRAPHY_VISUAL_BASELINE.md`.

3. **Source mapping**
   - Проанализировать точный источник `font-weight` для task labels:
     - `05-02-bpmn-text-contrast.css`
     - `02-06-bpmn-dark-theme.css`
     - bpmn-js inline styles (через DevTools)
     - Любые другие CSS-файлы.
   - Записать `CSS_SOURCE_MAP.md`.

4. **Применение bounded fix**
   - Предпочесть минимальное CSS-изменение.
   - Возможные действия (только если подтверждены baseline):
     - a) Добавить / изменить `font-weight` для `.bpmnCanvas .djs-shape .djs-label` (или более точного селектора).
     - b) Если `paint-order: stroke fill` применяется к task labels — рассмотреть его ослабление или удаление.
     - c) Тонкая корректировка `--bpmn-task-text` opacity (если нужно).
     - d) Опционально: нормализовать `font-weight` / `box-shadow` чипов (`fpcNodeBadge`, `fpcPropertyRow`).
   - Не трогать JS-файлы.
   - Не возвращать drop-shadow / filter.

5. **Версия**
   - Обновить `frontend/src/config/appVersion.js` → v1.0.134.
   - Добавить changelog entry.

6. **Сборка и runtime after**
   - Собрать frontend.
   - Обновить `build-info.json`.
   - Открыть свежий 5180.
   - Сделать after-скриншоты.
   - Снять after computed styles.
   - Записать `VISUAL_BEFORE_AFTER.md`, `TASK_LABEL_COMPUTED_STYLE_ANALYSIS.md`.

7. **Validation**
   - Проверить interaction mode (pan) — нет flash, нет style jump.
   - Проверить network — 0 PUT/PATCH при pan.
   - Проверить console — 0 errors.
   - Проверить chip density — записать `OVERLAY_CHIP_DENSITY_CHECK.md`.

8. **Handoff**
   - Написать `EXEC_REPORT.md`.
   - Создать `READY_FOR_REVIEW`.
   - Если заблокировано — `EXEC_BLOCKED.md` с причиной.

---

## Agent 3 Review Plan

Agent 3 (Reviewer) должен выполнить **независимую** проверку:

1. **GSD + RAG**
   - Запустить reviewer GSD checks.
   - Запустить reviewer RAG preflight.

2. **Source review**
   - Проверить, что изменения ограничены CSS-файлами.
   - Проверить, что нет backend/package/Product Actions/RAG изменений.
   - Проверить, что предыдущие performance-фиксы не затронуты.

3. **Fresh 5180 proof (независимый)**
   - `curl -I http://clearvestnic.ru:5180` → HTTP 200, no-cache.
   - `build-info.json` → v1.0.134, contourId совпадает.
   - Footer → **Версия v1.0.134**.
   - Маркер **НЕ на canvas**.

4. **Default task typography**
   - Открыть диаграмму (overlays OFF).
   - Инспектировать computed styles task label **независимо**:
     - `font-weight` должен быть спокойным (не 700, если это было проблемой).
     - Текст должен быть читаемым.
     - Текст не должен "выскакивать" из диаграммы.

5. **Interaction mode (реальный drag)**
   - Зажать ЛКМ и сдвинуть canvas.
   - Убедиться, что `.fpcDiagramInteracting` работает.
   - **Нет белого flash.**
   - **Нет style jump** у текста / fill.
   - `will-change: transform` сохранён.

6. **После pointerup**
   - Стили стабильны.
   - Класс interaction снят.

7. **Overlay / chip density**
   - Если чипы изменены — оценить улучшение.
   - Если не изменены — убедиться, что они не стали агрессивнее.

8. **Network + Console**
   - 0 PUT /bpmn при pan.
   - 0 PATCH /sessions при pan.
   - 0 console errors.

9. **Build**
   - Сборка прошла.
   - Тесты прошли (или только pre-existing failures).

10. **Verdict**
    - Создать `REVIEW_REPORT.md` на русском.
    - Выставить `REVIEW_PASS` **только** если все критерии acceptance выполнены и пользовательская проблема действительно исправлена визуально.
    - Иначе — `REWORK_REQUEST.md` с конкретными замечаниями.

---

## Risks

| Риск | Уровень | Митигация |
|------|---------|-----------|
| Перекоррекция: текст станет слишком светлым / нечитаемым | Средний | Минимальное изменение; тестировать на тёмном canvas; сохранить fallback в CSS-переменных. |
| Слом светлой темы | Низкий | Селекторы `.light .bpmnStage` не трогать без явной необходимости; проверить override'ы. |
| Регрессия performance (вернуть filter/shadow) | Низкий | Запрет на добавление filter/drop-shadow; проверить will-change. |
| Чипы станут незаметными после ослабления | Низкий | Только если чипы меняются; использовать очень мягкое снижение (font-weight 700→600, opacity 1→0.92). |
| Расхождение computed style между браузерами | Низкий | Playwright/Chromium — единственный target; фиксировать exact values. |

---

## Gates

- [x] GSD discipline recorded
- [x] Source/runtime truth captured
- [x] RAG preflight (planner) completed
- [x] RAG preflight (reviewer) completed
- [x] User visual observation captured
- [x] Previous evidence reviewed
- [x] Source map targets identified
- [x] Hypotheses defined
- [x] Bounded fix strategy documented
- [x] Version plan documented
- [x] Validation plan documented
- [x] Acceptance criteria defined
- [x] Agent 2 execution plan written
- [x] Agent 3 review plan written
- [x] STATE.json written
- [x] AGENT_RUN_ID written
- [ ] READY_FOR_EXECUTION — будет создан после утверждения плана
