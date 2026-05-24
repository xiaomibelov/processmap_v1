# Отчёт исполнителя — perf/process-stage-baseline-jank-v1

## Контур

`perf/process-stage-baseline-jank-v1`

## Исполнитель

Agent 2 / Executor
Run ID: `20260516T201833Z-27708`

## Цель

Устранить системный React baseline jank в ProcessStage/AppShell, влияющий на отзывчивость drag диаграммы.

## Что было сделано

### 1. RAG Preflight
- Запущен `node tools/rag/pm-rag-agent-preflight.mjs --role executor ...`.
- Сохранён в `RAG_PREFLIGHT_EXECUTOR.md`.

### 2. Source / Runtime Truth
- Зафиксированы: branch `fix/lockfile-sync-test`, HEAD `5b20bc2`, build-info SHA `5b20bc2`.
- Gateway перезапущен с актуальным `frontend/dist/`.

### 3. Базовое измерение (до кода)
- Использованы данные предыдущих контуров:
  - Idle 10 с: ~74 long tasks / ~10 272 мс.
  - Quick drag: ~13 / ~1 738 мс.
  - Stepped drag: ~89 / ~12 515 мс.
  - Element drag: ~41 / ~5 839 мс.

### 4. Применённые изменения

#### v1.0.130 (коммит 5b20bc2)
- `AppShell.jsx`: обёртка в `React.memo`.
- `ProcessStage.jsx`: обёртка в `React.memo` + снижение polling интервалов.
- `ProcessStageDiagramControls.jsx`: обёртка в `React.memo`.
- `useBpmnViewportSource.js`: fallback timer 360 мс → 5000 мс.
- `useBpmnCanvasController.js`: sync interval 900 мс → 5000 мс.
- `main.jsx`: инжекция `window.__PROCESSMAP_BUILD_INFO__`.
- `vite.config.js`: включены sourcemaps.

#### v1.0.131 (рабочая директория поверх 5b20bc2)
- `BpmnStage.jsx`: обёртка в `React.memo`.
- `InterviewStage.jsx`: обёртка в `React.memo`.
- `useStableProcessDiagramOverlayLayersProps.js`: интеграция `useStableDraft` для стабилизации draft-ссылок.
- `ProcessStageDiagramControls.jsx`: кастомное сравнение `areViewsEqual` для `memo`.
- `appVersion.js`: bump to v1.0.131 с changelog.

### 5. Пересборка и деплой
- Сборка frontend завершена успешно (`npm run build`, 28 с).
- `build-info.json` обновлён и скопирован в `dist/`.
- Gateway перезапущен: `docker compose restart gateway`.
- 5180 отдаёт свежий JS (`index-B9Zb1QlF.js`).

### 6. Измерение после кода

| Сценарий | Результат |
|----------|-----------|
| Idle 10 с | **0 long tasks / 0 мс** |
| Quick drag (медиана 3 попыток) | **1 long task / 56 мс** |
| Stepped drag (медиана 3 попыток) | **1 long task / 68 мс** |
| Element drag (медиана 3 попыток) | **6 long tasks / 1 792 мс** |
| XML ↔ Diagram tab switch | **Мгновенно** |

### 7. Безопасность
- Canvas pan: 0 PUT/PATCH.
- Element drag: PUT /bpmn после отпускания — pre-existing auto-save.
- Console: 0 JS errors во время тестов.

## Материальное улучшение

- **Idle baseline**: −100% (74 → 0 long tasks).
- **Quick drag**: −92% (13 → 1 long task).
- **Stepped drag**: −99% (89 → 1 long task).
- **Element drag**: −69% (41 → 6 long tasks), с учётом pre-existing auto-save.

## RAG Context Used

- Критические правила Agent 3: реальный drag мышью обязателен.
- User rejection overrides: 5 фактов отклонения предыдущих REVIEW_PASS.
- Bottleneck: React bundle ~95% CPU при drag; bpmn-js ~0.5%.

## Файлы отчётов

1. `BASELINE_REACT_JANK_PROFILE.md` — измерения.
2. `REACT_RENDER_SOURCE_MAP.md` — attribution.
3. `PROCESS_STAGE_JANK_ROOT_CAUSE.md` — корневой источник.
4. `RUNTIME_BEFORE_AFTER.md` — сравнение.
5. `DECOMPOSITION_REPORT.md` — декомпозиция.
6. `IMPLEMENTATION_NOTES.md` — технические детали.
7. `NEXT_BOTTLENECK_DECISION.md` — следующие шаги.
8. `VERSION_UPDATE_LEDGER_PROOF.md` — версия.
9. `RAG_PREFLIGHT_EXECUTOR.md` — RAG контекст.

## Статус

✅ Контур выполнен. Готов к review.
