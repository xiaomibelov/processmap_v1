# TESTS — graphify-semantic-zones

## 1. Unit tests

Файл: `tools/graphify-render-graph.test.py`

Запуск:
```bash
python tools/graphify-render-graph.test.py
```

Покрытие:
- `test_render_produces_readable_html` — базовый рендер: communities, legend, NODE INFO, фильтры по категориям, forceAtlas2 layout.
- `test_semantic_zones_and_traces` — классификация слоёв, панель LAYERS, тоггл зон, reconstructed semantic links, trace steps.
- `test_missing_graph_json_fails` — graceful error при отсутствии `graph.json`.

### Semantic-trace проверки (в `test_semantic_zones_and_traces`)

- `LAYERS` панель содержит `FRONTEND`, `BACKEND`, `STORAGE`.
- `TRACES[0].steps` включает frontend → backend → persistence.
- Backend/persistence шаги, не достижимые по реальным рёбрам, имеют `"semantic": true`.
- `SEMANTIC_EDGES` имеют `kind: "semantic"`, `dashes: [10, 6]` и `reconstructed: true`.

## 2. Проверка зоны persistence с подписью

Данные из сгенерированного `graphify-out/graph.html`:
- Aggregate graph: 1072 community nodes.
- Raw graph: 19954 nodes, 55681 edges.
- Persistence layer (raw): 180 nodes.
- Persistence layer (aggregate): 21 community nodes.

Проверки:
1. В HTML присутствует `<svg id="zone-svg">` и функция `drawZones()`.
2. `LAYERS` содержит слой `persistence` с `label: "STORAGE"`, `color: "#E15759"`, `draw_zone: true`.
3. При `zones-toggle` включённом SVG содержит `<rect class="layer-zone">` и `<text class="layer-zone-label">` для persistence.
4. Подпись зоны — "STORAGE".

Скриншот: `graphify-out/graph_zones_all.png`.

## 3. Согласованность среза нод: aggregate vs raw

- Aggregate view отображает **1072 community nodes** — это мета-граф, построенный поверх raw graph.
- Raw graph содержит **19954 nodes** и **55681 edges**.
- Каждая community node в aggregate view представляет один кластер из raw nodes (community detection Louvain/Leiden).
- Слои классифицируются на raw graph, затем доминирующий слой переносится на community node.
- Срез нод для зон и трассировок берётся из того же aggregate набора `RAW_NODES` (1072 записей), поэтому зоны и trace подсветка согласованы.

Проверка:
```bash
python3 - <<'PY'
import re, json
html = open('graphify-out/graph.html').read()
nodes = json.loads(re.search(r'const RAW_NODES = (\[.*?\]);', html, re.DOTALL).group(1))
print('aggregate nodes:', len(nodes))
print('layers:', {l['id']: l['count'] for l in json.loads(re.search(r'const LAYERS = (\[.*?\]);', html, re.DOTALL).group(1))})
PY
```

Ожидаемый результат:
```
aggregate nodes: 1072
layers: {'frontend': 10177, 'backend': 3955, 'persistence': 180, 'infra_tools': 1454, 'docs_planning': 74, 'test': 3461, 'unclassified': 653}
```

## 4. Ручные скриншот-проверки

| Скриншот | Что проверяется |
|---|---|
| `graphify-out/graph_zones_all.png` | Общий вид с зонами, легенда слоёв, COMMUNITIES, stats |
| `graphify-out/graph_zones_nodeinfo.png` | NODE INFO: id, label, community, layer badge, degree, scenarios, neighbors |
| `graphify-out/graph_trace_save_diagram.png` | Трассировка save-diagram: 6 шагов, reconstructed backend/persistence, пунктирные semantic links |
| `graphify-out/graph_trace_create_session.png` | Трассировка create-and-open-session |
| `graphify-out/graph_trace_ask_ai.png` | Трассировка ask-ai-agent |

## 5. Критерии приёмки

- [x] ≥90% нод классифицированы в слои (unclassified = 653 / 19954 ≈ 3.3%).
- [x] На скриншоте видны зоны FRONTEND / BACKEND / STORAGE.
- [x] Трассировки 3 сценариев показывают корректные цепочки frontend → backend → persistence.
- [x] Semantic links визуально отделены от real edges (пунктир, легенда "semantic link (reconstructed)").
- [x] NODE INFO помечает reconstructed-связи.
