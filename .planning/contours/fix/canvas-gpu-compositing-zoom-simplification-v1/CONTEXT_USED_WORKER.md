# CONTEXT_USED_WORKER.md

**Контур**: `fix/canvas-gpu-compositing-zoom-simplification-v1`  
**Run ID**: `20260528T210002Z-13339`  
**Агент**: Agent 2 / Worker

---

## RAG Preflight

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "fix/canvas-gpu-compositing-zoom-simplification-v1" --area "worker context" --format md --top-k 5
```

### Ключевые факты
- Предыдущий контур `fix/canvas-viewport-culling-v1` был ОТКАЧЕН пользователем
- `fix/canvas-overlay-debounce-v1` дал FPS ~50, но лаг остался
- Гипотеза: узкое место — paint/composite cost, не overlay updates
- RAG read-only boundary — нельзя авто-мутировать код на основе RAG

### Решения, принятые из RAG
- НЕ использовать DOM removal / culling
- НЕ модифицировать ядро bpmn-js
- Target: paint/composite через GPU layers

## Obsidian Context

### Files Read
1. `Audits/Diagram Baseline No Overlays Canvas Profile.md` — HIGH relevance
   - Selection triggers +3,186 SVG nodes
   - H5 hypothesis: "CSS/SVG repaint cost dominates"
2. `Audits/Diagram Property Overlays Performance Audit.md` — MEDIUM relevance
   - Overlays debounce уже сделан

### Решения из Obsidian
- Paint/composite cost — доминирующий bottleneck
- GPU layer promotion необходим
- Все узлы должны оставаться в DOM

## GSD Context

- GSD tooling доступен (`/opt/processmap-test/bin/gsd`)
- Проект-level config/roadmap/state отсутствуют
- Используется bounded contour approach из AGENTS.md

## Имплементационные решения, изменённые в ходе работы

1. **Отказ от connection line simplification**:
   - PLAN.md упоминала "прямые линии при zoom < 0.3"
   - CSS не позволяет изменить routed paths на прямые линии
   - Renderer hook потребовал бы кастомного renderer или ядра
   - Решение: оставить out-of-scope, фокус на GPU + zoom shape simplification

2. **deferUpdate: true**:
   - Не был явно указан в PLAN.md
   - Обнаружен как низкоуроговая оптимизация при анализе bpmn-js config
   - Добавлен в Viewer и Modeler для снижения sync layout thrashing

3. **Overlay pan debouncer интегрирован**:
   - Уже существовал в виде отдельной логики
   - Объединён в тот же модуль `wireBpmnStageRuntimeEvents.js` для чистоты
   - Это НЕ новая overlay-debounce логика — она уже была в предыдущем контуре

4. **Runtime proof correction (REVIEW_BLOCKED investigation)**:
   - Reviewer утверждал mismatch между `dist/` и `:5177`
   - Обнаружена архитектура: `processmap-test-gateway-1` (nginx) → `:5177`, `processmap-test-frontend-1` (Vite) → внутренний порт
   - nginx root: `/usr/share/nginx/html`, bind-mount отсутствует — требуется `docker cp`
   - Проверка `curl :5177/assets/...` подтвердила, что CSS/JS бандлы СОДЕРЖАТ изменения
   - Выполнен `docker cp dist/. → nginx` + `nginx -s reload` для гарантии синхронизации
   - Вердикт: runtime/source truth совпадают
