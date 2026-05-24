# Технические заметки реализации — perf/process-stage-baseline-jank-v1

## Изменённые файлы

### Коммит 5b20bc2 (v1.0.130)
1. `frontend/src/main.jsx` — инжекция `window.__PROCESSMAP_BUILD_INFO__`.
2. `frontend/src/components/AppShell.jsx` — `memo()` обёртка.
3. `frontend/src/components/ProcessStage.jsx` — `memo()` обёртка + снижение polling.
4. `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx` — `memo()` обёртка.
5. `frontend/src/features/process/stage/controllers/useBpmnViewportSource.js` — 360мс → 5000мс.
6. `frontend/src/features/process/stage/hooks/useBpmnCanvasController.js` — 900мс → 5000мс.
7. `frontend/src/config/appVersion.js` — bump to v1.0.130.
8. `frontend/vite.config.js` — `sourcemap: true`.

### Рабочая директория поверх 5b20bc2 (v1.0.131)
9. `frontend/src/components/process/BpmnStage.jsx` — `memo()` обёртка.
10. `frontend/src/components/process/InterviewStage.jsx` — `memo()` обёртка.
11. `frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js` — интеграция `useStableDraft`.
12. `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx` — `areViewsEqual` для кастомного сравнения.
13. `frontend/src/config/appVersion.js` — bump to v1.0.131.

## useStableDraft — детали

- **Алгоритм хеширования**: FNV-1a по нормализованной сигнатуре draft.
- **Поля в сигнатуре**: id, session_id, xmlHash (первые 8000 символов BPMN XML), title, steps, nodes, edges, notes, meta.updated_at, diagram_state_version, bpmn_xml_version.
- **Безопасность**: Render-phase ref update — идемпотентен, не влияет на другие компоненты.

## Сборка

- Сборка выполнена с `NODE_OPTIONS="--max-old-space-size=3072"`.
- Sourcemaps включены (`vite.config.js`).
- Время сборки: ~28–39 с.

## Gateway restart

- `docker compose restart gateway` после обновления `frontend/dist/`.
- Nginx подхватывает новые `index.html` и ассеты автоматически через volume mount.
