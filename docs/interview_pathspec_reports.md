# Interview: PathSpec, Time Model, Hash и Версии Отчётов

## PathSpec (ручной путь)
- `PathSpec` — источник истины для порядка шагов в Interview.
- В ручном режиме порядок задаётся только `order_index`.
- UI Matrix/Paths должен отображать шаги строго по `order_index` (без сортировок по времени/названию).

## Diagram Paths-разметка (P0/P1/P2 + sequence)
- На уровне BPMN-узлов хранится явная разметка `bpmn_meta.node_path_meta`:
  - `node_id -> { paths: ["P0"|"P1"|"P2"], sequence_key, source }`.
- `source`:
  - `manual` — ручная разметка в Diagram sidebar,
  - `color_auto` — авто-миграция из существующих цветов sequenceFlow.
- Paths View строится из этой разметки (fallback на flow-tier только когда `node_path_meta` пуст).
- Порядок внутри сценария детерминирован:
  - сначала BPMN traversal order (StartEvent + sequenceFlow),
  - затем fallback по rank/id.

## Время шага: work и wait
- `work_duration_sec` — активное выполнение шага.
- `wait_duration_sec` — ожидание (очередь, таймер, устройство, курьер и т.п.).
- Хранение: секунды.
- Ввод в UI: минуты, с автоконвертацией в секунды.
- Пресеты: `+30с`, `+1м`, `+2м`, `+5м`, очистка `×` (ставит `null`).

## Totals
- Рассчитываются по активному пути:
  - `steps_count`
  - `work_time_total_sec`
  - `wait_time_total_sec`
  - `total_time_sec = work + wait`
- Показ в шапке: `Шагов`, `Работа`, `Ожидание`, `Итого` (HH:MM).

## steps_hash
- `steps_hash = sha256(canonical_json)`.
- `canonical_json` включает только значимые поля шага:
  - `order_index`, `title`, `lane_id`, `bpmn_ref`, `work_duration_sec`, `wait_duration_sec`, `decision`, `notes`.
- Любое изменение только UI-состояния (выделение, раскрытие панелей и т.п.) не должно менять `steps_hash`.

## Payload для AI-отчёта
- Формируется строго по `order_index`.
- Не включает BPMN XML.
- Содержит:
  - идентификаторы пути/сессии,
  - totals,
  - шаги в ручном порядке,
  - агрегаты качества заполнения:
    - `% missing work_duration`,
    - `% missing wait_duration`,
    - `% missing notes`,
  - `dod_summary` по шагам (`order_index -> missing[]`),
  - `quality_summary` (orphan/dead-end/link-integrity counts).

## Версии отчётов
- Каждая генерация создаёт новую `ReportVersion` (без перезаписи старых).
- Версия автоинкрементируется в пределах `(session_id, path_id)` начиная с `1`.
- Для версии хранится `steps_hash`; по нему вычисляется:
  - `актуален` (`report.steps_hash === current_steps_hash`),
  - `устарел` (иначе).
- В UI доступны:
  - список версий (vN, статус, дата/время, hash short),
  - фильтры (только актуальные, только ошибки),
  - просмотр деталей,
  - повторная генерация (всегда новая версия),
  - автопуллинг статуса для `running`.
