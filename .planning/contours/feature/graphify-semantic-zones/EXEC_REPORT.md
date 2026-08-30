# EXEC_REPORT — feature/graphify-semantic-zones

## 1. Цель контура

Добавить семантический слой поверх force-layout графа ProcessMap:
- архитектурные зоны (frontend / backend / persistence / infra / docs / test);
- легенда слоёв с фильтрами;
- режим трассировки 3 user-flow сценариев с reconstructed semantic links;
- расширенное NODE INFO (layer, scenarios, neighbors).

## 2. Что изменено

| Файл | Изменение |
|---|---|
| `tools/graphify-semantic-config.json` | Новый конфиг: правила классификации слоёв, 3 сценария трассировки, цвета зон |
| `tools/graphify-render-graph.py` | Полная переработка: классификация нод, layer-зоны, LAYERS панель, трассировка, semantic dashed links, NODE INFO |
| `tools/graphify-render-graph.test.py` | Расширены тесты: semantic zones, trace steps, reconstructed edges, raw vs aggregate stats |
| `graphify-out/graph.html` | Перегенерированный интерактивный граф |
| `graphify-out/graph_zones_*.png` | Скриншоты зон, NODE INFO, трассировок |
| `graphify-out/graph_trace_*.png` | Скриншоты 3 сценариев трассировки |

## 3. Результаты

### 3.1 Генерация графа

```text
Loaded graph: 19954 nodes, 55681 edges, 1072 communities
Meta-graph: 1072 community nodes, 1754 cross-community edges
Trace 'create-and-open-session': 5 communities, 1 semantic edges
Trace 'save-diagram': 6 communities, 1 semantic edges
Trace 'ask-ai-agent': 3 communities, 1 semantic edges
```

### 3.2 Почему на экране 1072 ноды, а не 19954

Вьювер показывает **aggregate community-view**, а не raw-ноды:

- **Raw graph:** 19954 nodes, 55681 edges — исходный AST/dependency граф, построенный graphify.
- **Communities:** Louvain/Leiden кластеризация сгруппировала raw-ноды в 1072 communities.
- **Meta-graph:** каждая community стала одной нодой; рёбра между community — cross-community edges (1754 шт.).
- **Классификация слоёв** выполняется на raw-нодах, затем доминирующий слой переносится на community-ноду.
- **Зоны, трассировка, NODE INFO** работают с этим же aggregate набором из 1072 community-нод.

Такой срез выбран осознанно: node-level view 19954 нод превышает лимит производительности vis-network в браузере, а aggregate view остаётся читаемым и интерактивным.

### 3.3 Классификация слоёв (raw nodes)

| Слой | Raw nodes | Community nodes | Зона по умолчанию |
|---|---|---|---|
| frontend | 10177 | ~540 | on |
| backend | 3955 | ~210 | on |
| persistence | 180 | 21 | on |
| infra_tools | 1454 | ~120 | on |
| docs_planning | 74 | ~8 | off |
| test | 3461 | ~150 | off |
| unclassified | 653 | ~23 | off |

Unclassified: **3.3%** (целевое ≤10%).

### 3.4 Зона persistence

- Persistence layer: **180 raw nodes** → **21 community nodes**.
- В `graphify-semantic-config.json` слой `persistence` имеет `draw_zone: true`, `label: "STORAGE"`, `color: "#E15759"`.
- При включённых зонах SVG рисует bounding box / convex hull вокруг 21 community-нод persistence и подпись **STORAGE**.
- Скриншот: `graphify-out/graph_zones_all.png`.

### 3.5 Трассировки

| Сценарий | Frontend seeds | Backend seeds | Persistence seeds | Semantic edges |
|---|---|---|---|---|
| create-and-open-session | useSessionActivationOrchestration.js, useSessionActivationOrchestration() | session_service.py, explorer.py | Session, Node | frontend→backend |
| save-diagram | lib/api.js, saveCoordinator.js | session_service.py, sessions.py | Session, Node | frontend→backend |
| ask-ai-agent | ProcessmanChatFeed.jsx, AIQuestionsSection.jsx | agent/chat.py, app/routers/agent_chat.py | schemas/agent_chat.py, AgentChatOut | frontend→backend |

Все backend/persistence шаги в trace steps помечены как `reconstructed`, потому что прямых рёбер frontend↔backend в AST-графе нет.

### 3.5 Semantic links: визуальное отличие и легенда

- Semantic edges рисуются **пунктиром** `dashes: [10, 6]`, width 2, opacity 0.85, цвет слоя-источника.
- В легенде трассировки есть строка **«— — — semantic link (reconstructed)»** с пояснением: «Frontend и backend не соединены ребром в graphify-графе; связь reconstructed по именам/path.»
- В **NODE INFO** reconstructed-связи выводятся в блоке «Reconstructed links» с меткой `(semantic)` и причиной (`reason`).
- В **TRACE STEPS** reconstructed шаги помечены `(reconstructed)`.

### 3.6 Тесты

```bash
python tools/graphify-render-graph.test.py
# OK
```

## 4. Скриншоты

- `graphify-out/graph_zones_all.png` — общий вид с зонами и легендой
- `graphify-out/graph_zones_nodeinfo.png` — NODE INFO для saveCoordinator.js
- `graphify-out/graph_trace_save_diagram.png` — трассировка сохранения диаграммы
- `graphify-out/graph_trace_create_session.png` — трассировка создания сессии
- `graphify-out/graph_trace_ask_ai.png` — трассировка вопроса AI-агенту

## 5. Соответствие условиям пользователя

| Условие | Статус |
|---|---|
| Semantic links визуально отличны от real edges | ✅ пунктир `[10, 6]`, width 2, opacity 0.85, цвет слоя-источника; легенда "semantic link (reconstructed)" |
| NODE INFO помечает reconstructed-связи | ✅ блок "Reconstructed links" с `(semantic)` и `reason`; TRACE STEPS помечены `(reconstructed)` |
| Зона persistence отрисована с подписью | ✅ 180 raw nodes → 21 community nodes, `draw_zone: true`, подпись "STORAGE", см. `graph_zones_all.png` |
| Расхождение 1072 vs ~20k нод объяснено | ✅ aggregate community-view из 1072 community-нод над raw graph 19954 нод; см. §3.2 и §3.4 |
| Код не начат до approve PLAN.md | ✅ PLAN.md был одобрен |
| Ветка feature/graphify-semantic-zones | ✅ |
| Никаких merge/deploy без approve | ✅ ожидается approve на PR |

## 6. Риски и ограничения

- Semantic links — это **reconstructed** связи между слоями, а не рёбра AST-графа. Они отображаются пунктиром и явно помечены.
- Backend↔persistence semantic edge не добавляется автоматически, если между seed-нодами уже есть ребро в raw graph (в нашем случае `session_service.py` — `models.py` связаны импортом). Это корректно: real edge есть, повторный reconstructed не нужен.
- Зоны рисуются bounding box / convex hull поверх стабилизированного layout; при перезагрузке позиции могут незначительно смещаться.

## 7. Следующий шаг

Запросить approve пользователя на создание PR.
