# EXEC_PART_1_REPORT — fix/diagram-interaction-mode-visual-regression-v1

**Agent:** Agent 2 / Executor Part 1  
**Contour:** `fix/diagram-interaction-mode-visual-regression-v1`  
**Run ID:** 20260516T224839Z-35866  
**Дата:** 2026-05-16T23:00+00:00  
**Язык:** русский

---

## 0. Pre-flight (выполнено)

- [x] Прочитан `EXECUTOR_PROMPT.md` (fallback, part-specific отсутствовал).
- [x] Прочитан `PLAN.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, `STATE.json`.
- [x] RAG preflight выполнен → `RAG_PREFLIGHT_EXECUTOR.md`.
- [x] Source/runtime truth зафиксирован.
- [x] Fresh 5180 подтверждён (`build-info.json` v1.0.132).

---

## 1. Source / Runtime Truth

| Параметр | Значение |
|----------|----------|
| `pwd` | `/opt/processmap-test` |
| `branch` | `fix/lockfile-sync-test` |
| `HEAD` | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| `origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git diff --stat` | 11 files changed, 125(+), 64(-) |
| Health :8088 | `{"ok":true,...}` |
| Health :5180 | HTTP 200 OK |
| Build info | v1.0.132, contour `perf/...-smoothness-v1` |

---

## 2. Воспроизведение регрессии

### Сценарий A — Default task style
- Открыт проект `wewe` / «Описание процессов Долгопрудный».
- Overlays выключены (`window.fpcPropertyOverlay = 0`).
- Computed styles задач зафиксированы:
  - `fill`: `color(srgb 0.0588 0.0863 0.1490 / 0.1443)` — тёмно-серый
  - `stroke`: `color(srgb 0.9255 0.9608 1.0 / 0.6633)` — светлый
  - `font-weight`: `700`
  - `viewport filter`: `brightness(0.88) contrast(0.96)`

### Сценарий B — Canvas pan (simulated)
- Добавлен класс `.fpcDiagramInteracting` к `.djs-container`.
- `viewport filter` сменился на `none`.
- Fill остался тем же, но из-за снятия filter визуально задачи вспыхивают белым.

---

## 3. Идентификация источника регрессии

### Ключевой файл: `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`

Правила в `02-06-bpmn-dark-theme.css` (уже изменены в рабочей ветке на белый fill) **не применяются**, потому что `05-02-bpmn-text-contrast.css` имеет:
- Более специфичный селектор (`:not(...)` chain)
- `!important`
- Загружается позже

Фактический fill задач:
```
--bpmn-task-fill: rgba(15, 22, 38, 0.72)
color-mix(... 20%, transparent) → rgba(15, 22, 38, 0.144)
```

### Дополнительные файлы:
- `legacy_bpmn.css` — базовый `filter: brightness(.88) contrast(.96)` + `filter: none` в interaction mode
- `06-final-structure.css` — дублирование тех же filter-правил

---

## 4. Гипотезы и верификация

| ID | Гипотеза | Статус |
|----|----------|--------|
| H1 | Базовый `brightness(.88) contrast(.96)` делает задачи серыми | **Подтверждена** — filter усиливает серость |
| H2 | `shape-rendering: crispEdges` делает текст жирным | **Отвергнута** — селектор не включает `text` |
| H3 | `filter: none` во время interaction вызывает белый flash | **Подтверждена** — computed filter меняется с `brightness(.88)` на `none` |
| H4 | Исправление может быть CSS-only | **Подтверждена** — все изменения CSS-only |
| H5 | Light vs dark theme ведут себя по-разному | **Подтверждена частично** — light theme имеет собственный override |

---

## 5. Применённые изменения (Part 1)

### 5.1 `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`
- `--bpmn-task-fill` (dark): `rgba(15, 22, 38, 0.72)` → `rgba(255, 255, 255, 0.92)`
- `--bpmn-task-stroke` (dark): `rgba(236, 245, 255, 0.78)` → `rgba(30, 41, 59, 0.8)`
- `color-mix` fill percentage: `20%` → `92%`

### 5.2 `frontend/src/styles/legacy/legacy_bpmn.css`
- Удалён базовый viewport filter.
- Удалён `filter: none` из interaction-mode.
- Сохранён `will-change: transform`.

### 5.3 `frontend/src/styles/app/06-final-structure.css`
- Аналогично 5.2.

### 5.4 `frontend/src/config/appVersion.js`
- Changelog v1.0.133 обновлён согласно спецификации.

---

## 6. Что остаётся для Part 2

1. **Сборка:** `npm run build` (или Docker frontend container).
2. **Валидация runtime:**
   - Fresh 5180 с новыми ассетами.
   - Before/after скриншоты.
   - Проверка computed styles.
   - Реальный canvas pan — отсутствие белого flash.
   - pointerup — стабильность стиля.
   - Light/dark theme.
   - No PUT/PATCH during view pan.
   - No console errors.
3. **Версия:** Проверить v1.0.133 в footer.
4. **Маркер:** Убедиться, что маркер версии НЕ на canvas.
5. **Review handoff:** Создать `READY_FOR_REVIEW`.

---

## 7. Артефакты

- `EXEC_PART_1_REPORT.md` — этот файл
- `RAG_PREFLIGHT_EXECUTOR.md` — RAG контекст
- `VISUAL_REGRESSION_BASELINE.md` — before evidence
- `CSS_SOURCE_MAP.md` — exact selectors и fixes
- `INTERACTION_MODE_STYLE_ANALYSIS.md` — computed style analysis
- `VISUAL_BEFORE_AFTER.md` — comparison (after pending)
- `VERSION_UPDATE_LEDGER_PROOF.md` — version proof
- `RUNTIME_BEFORE_AFTER.md` — runtime state proof
- `IMPLEMENTATION_NOTES.md` — что изменено и почему
- `screenshots/*.png` — before скриншоты

---

## 8. Статус

**Part 1 завершён.** Готов к передаче Part 2.
