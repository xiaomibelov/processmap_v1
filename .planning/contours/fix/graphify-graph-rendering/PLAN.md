# PLAN — fix/graphify-graph-rendering

## Контур
- **type:** `fix`
- **name:** `graphify-graph-rendering`
- **роль:** Agent 2 (Executor)
- **создан:** 2026-08-29
- **ветка:** `fix/graphify-graph-rendering`
- **baseline:** `origin/main` (`7f161478`)

## Проблема
`graphify-out/graph.html` (корневая визуализация графа ProcessMap) отображается некорректно:
- 1072 community-ноды, 1754 cross-community рёбра, 1072 communities — агрегированный вид нечитаем.
- Панель **COMMUNITIES** содержит только «Select All», список сообществ пуст (`LEGEND = []`).
- Лейблы нод — `Community 0`, `Community 1` вместо человекочитаемых имён.
- Изолированные/слабосвязанные community-ноды разлетаются по периметру экрана.
- Три плотных кластера в центре нечитаемы из-за наложения и отсутствия лейблов.
- Клик по ноде не показывает содержательной информации.

## Диагностика (предварительная)
1. `graphify-out/graph.json` содержит **19954 nodes / 55681 edges** — граф валиден, рёбра на месте.
2. `graphify-out/.graphify_analysis.json` содержит **1072 communities** с разумным распределением размеров (top: 277, 252, 187…). Louvain/Leiden отработал.
3. `graph.html` — это **агрегированное community-view**, сгенерированное пакетом `graphifyy`, потому что node-level view превышает лимит 5000 нод.
4. При генерации aggregate view `graphify.exporters.html.to_html` не получило `community_labels` (файл `.graphify_labels.json` отсутствует в корневом `graphify-out/`). Поэтому:
   - лейблы нод остались `Community N`;
   - `LEGEND` остался пустым;
   - сайдбар COMMUNITIES не заполнен.

## Цель
Сделать `graphify-out/graph.html` читаемым без пересборки всего графа:
- community-ноды получают человекочитаемые имена (hub-based);
- сайдбар COMMUNITIES заполняется (имя, размер, чекбокс);
- layout держит изолированные ноды компактно и не даёт им разлетаться;
- топовые community-ноды по размеру/degree имеют лейблы;
- клик по ноде показывает id, label, community, degree, соседей.

## Границы
- Только tooling: новый/изменённый скрипт в `tools/` и тест к нему.
- Никаких изменений product runtime (`frontend/src/`, `backend/app/` и т.д.).
- Не меняем `graphify` как внешний pip-пакет (site-packages). Изменения коммитим в ProcessMap repo.
- Не пересоздаём `graph.json` / не запускаем полный `graphify .` (дорого, не нужно).

## План
1. **Реализация** `tools/graphify-render-graph.py`:
   - CLI: `--graph-dir PATH` (default `./graphify-out`), `--output PATH` (default `./graphify-out/graph.html`).
   - Читает `graph.json` и `.graphify_analysis.json`.
   - Загружает communities; генерирует hub-based labels (`graphify.cluster.label_communities_by_hub`).
   - Строит aggregate community meta-graph (нода = community, ребро = cross-community edge).
   - Для meta-graph вычисляет degree, size, топовые ноды.
   - Генерирует `graph.html` на базе улучшенного vis-network template:
     - раскраска по community;
     - легенда с именем, размером, чекбоксом;
     - layout forceAtlas2Based с настроенными `gravitationalConstant`, `centralGravity`, `springLength`, `avoidOverlap`;
     - изолированные ноды получают массовую центральную гравитацию / отдельную группировку;
     - лейблы только для топ-нод по degree/size;
     - панель NODE INFO с id, label, community, degree, соседями.
2. **Тест** `tools/graphify-render-graph.test.py`:
   - создаёт минимальный fixture `graph.json` + `.graphify_analysis.json`;
   - запускает скрипт;
   - проверяет, что `graph.html` содержит `LEGEND` с элементами, community labels, edges, node info panel, корректные stats.
3. **Проверка на реальных данных**:
   - запустить скрипт на `/Users/mac/agents_place/kimi_PM/graphify-out/`;
   - убедиться, что `graph.html` содержит legend, labels, edges, layout не разбрасывает изолированные ноды.
4. **Артефакты контура**:
   - `EXEC_REPORT.md` с git-proof, результатами тестов, рисками.
   - `STATE.json`.
   - `READY_FOR_REVIEW`.
5. **Mirror в Obsidian** через `tools/pm-agent-mirror-report.sh`.

## Acceptance Criteria
- [ ] `graphify-out/graph.html` stats показывает ≤ ~100 communities (aggregate view) или корректное node-level представление.
- [ ] Сайдбар COMMUNITIES содержит список с именами, размерами и рабочими чекбоксами.
- [ ] Все 1754 cross-community edges отрисованы/учтены в layout.
- [ ] Изолированные community-ноды визуально отделены и не мешают.
- [ ] Клик по ноде показывает id, label, community, degree, соседей.
- [ ] Тест `tools/graphify-render-graph.test.py` проходит.
- [ ] Без product-code изменений.

## Риски
- Мета-граф communities всё ещё может содержать ~500 изолированных community-нод (531 isolate в meta-graph). Для них нужна явная компоновка.
- vis-network forceAtlas2Based плохо справляется с сильно разреженным meta-графом; возможно потребуется предварительная расстановка координат или иерархическая группировка.
