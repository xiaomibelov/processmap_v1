# PR — feature/graphify-semantic-zones

## Заголовок

feat(graphify): семантические зоны и трассировка сценариев

## Описание

Добавляет семантический слой поверх graphify-графа ProcessMap:
- классификация нод по архитектурным слоям (frontend / backend / persistence / infra / docs / test);
- мягкие цветовые зоны с подписями и легендой слоёв;
- режим трассировки 3 user-flow сценариев;
- reconstructed semantic links между слоями (пунктир, отдельная легенда);
- расширенное NODE INFO с layer, scenarios, neighbors.

## Изменённые файлы

- `tools/graphify-semantic-config.json` (новый)
- `tools/graphify-render-graph.py`
- `tools/graphify-render-graph.test.py`
- `graphify-out/graph.html`
- `graphify-out/graph_zones_all.png`
- `graphify-out/graph_zones_nodeinfo.png`
- `graphify-out/graph_trace_save_diagram.png`
- `graphify-out/graph_trace_create_session.png`
- `graphify-out/graph_trace_ask_ai.png`

## Как проверить

```bash
cd p0-work-worktrees/feature-graphify-semantic-zones
python tools/graphify-render-graph.test.py
python tools/graphify-render-graph.py --graph-dir /Users/mac/agents_place/kimi_PM/graphify-out --output /Users/mac/agents_place/kimi_PM/graphify-out/graph.html
# открыть graphify-out/graph.html в браузере
```

## Критерии приёмки

- [x] ≥90% нод классифицированы (unclassified 3.3%).
- [x] Зоны frontend/backend/storage видны на карте.
- [x] 3 трассировки показывают корректные цепочки.
- [x] Semantic links визуально отличны от real edges.
- [x] NODE INFO помечает reconstructed-связи.

## Merge

Требуется approve пользователя. Никакого автоматического merge/deploy.
