# PLAN — fix/subprocess-preserve-di-on-sync

## Контекст

Audit `subprocess-layout-corruption` выявил: при синхронизации child-сессии из parent (`auto_create_subprocess_sessions` → `_refresh_child_session_bpmn_from_xml` → `extract_subprocess_xml`) для **collapsed** subprocess backend полностью перезаписывает `sessions.bpmn_xml` child-сессии grid auto-layout (`_generate_di_for_process`), теряя пользовательский DI. Версия в `bpmn_versions` при этом не создаётся.

Пострадавшие сессии: `773ec635cf`, `23d740ac8f`, `499ddb4693`, `12c5ffb061` (проект `062bfd212c`).

## Цель

Минимальный патч из двух изменений:

1. При перезаписи child XML сохранять существующие координаты (`BPMNShape` bounds, `BPMNEdge` waypoints) для элементов, которые остались в новой семантике.
2. Любая перезапись `sessions.bpmn_xml` через `auto_create_subprocess_sessions` сначала создаёт запись в `bpmn_versions` с прежним XML.

## Точки изменения

### 1. `backend/app/services/bpmn_navigation.py`

Добавить helper:

```python
def preserve_existing_di(new_xml: str, old_xml: str) -> str:
    """Merge preserved DI (shapes/edges by element id) from old_xml into new_xml.

    Returns new_xml unchanged when either side is unparseable or new_xml has no DI.
    Only shapes/edges whose element id exists in BOTH documents keep old coordinates.
    New elements keep the DI generated for them. Deleted elements disappear naturally.
    """
```

Алгоритм:
- Распарсить `old_xml`, собрать `shapes_by_id` и `edges_by_id` (ключ — `bpmnElement`).
- Распарсить `new_xml`, найти `BPMNDiagram/BPMNPlane`.
- **Фаза 1 — сохранённые элементы.** Для каждого `BPMNShape` в `new_xml`:
  - если `bpmnElement` есть в `old shapes_by_id` — заменить/скопировать `dc:Bounds` из old;
  - иначе оставить сгенерированный DI (временно).
- **Фаза 2 — размещение новых элементов.** Найти max-x/max-y среди уже размещённых (сохранённых + старт/энд, если они сохранены). Для каждого нового `BPMNShape` (id не найден в old):
  - сдвинуть его bounds в свободную область справа внизу: `x = max_x + GRID_STEP_X`, `y = max_y + GRID_STEP_Y`;
  - шаг grid берём такой же, как в `_generate_di_for_process` (120×80), чтобы визуально отличалось от случайного наложения;
  - если несколько новых элементов — располагать их по grid в одну строку/столбцы с тем же шагом;
  - обновлять `max_x`/`max_y` после каждого размещённого нового shape.
- **Фаза 3 — waypoints новых рёбер.** Для каждого `BPMNEdge` в `new_xml`:
  - если `bpmnElement` есть в `old edges_by_id` — заменить `di:waypoint` из old;
  - иначе это новый edge: пересчитать waypoints по **финальным** координатам `sourceRef`/`targetRef` после merge-размещения (центры bounds), а не по первоначальным grid-позициям.
- Вернуть сериализованный XML.

### 2. `backend/app/services/session_service.py`

Изменить сигнатуру и поведение `_refresh_child_session_bpmn_from_xml`:

```python
def _refresh_child_session_bpmn_from_xml(
    child: Session,
    child_xml: str,
    *,
    created_by: Optional[str] = None,
    org_id: Optional[str] = None,
) -> bool:
```

Внутри:
- `old_xml = str(getattr(child, "bpmn_xml", "") or "")`.
- Если `child_xml` непуст и отличается от `old_xml`:
  - **Снапшот:** если `old_xml` непуст — создать bpmn_versions snapshot через `session_repo.create_bpmn_version_snapshot(..., source_action="subprocess_sync")` **независимо от парсабельности old_xml**. Это бэкап для отката; битый XML тоже нужно сохранить.
  - `merged_xml = preserve_existing_di(child_xml, old_xml) or child_xml`.
  - `child.bpmn_xml = merged_xml`.
- `bpmn_meta` обновляется от `merged_xml` (или `child_xml`, разницы в extension-контексте нет).
- Вернуть `changed`.

Добавить приватный helper `_snapshot_child_bpmn(child, old_xml, created_by, org_id)` для вызова `session_repo.create_bpmn_version_snapshot` с техническим `source_action`.

В `auto_create_subprocess_sessions` передавать `created_by=uid, org_id=oid` в `_refresh_child_session_bpmn_from_xml`.

## Edge cases

| Сценарий | Поведение |
|----------|-----------|
| Элемент переименован, id сохранён | DI копируется по id; имя берётся из новой семантики |
| id элемента изменился | Это новый элемент; DI не копируется |
| Edge ведёт к удалённому элементу | Edge удаляется вместе с элементом (его нет в new_xml) |
| Subprocess стал expanded | `extract_subprocess_xml` уже скопирует DI из expanded shape; merge helper дополнительно сохранит совпадающие id без вреда |
| Old XML отсутствует (новый child) | Версию не создаём, merge — no-op |
| New/old XML непарсабелен | merge возвращает new_xml as-is; снапшот old_xml создаётся при любом непустом old_xml, отличающемся от new, даже если old непарсабелен |
| XML не изменился | Версию не создаём, idempotent |

## Тесты

Добавить в `backend/tests/test_auto_create_subprocess_sessions.py` и/или `backend/tests/test_bpmn_navigation_helpers.py`:

1. **Синхронизация с пользовательским DI сохраняет координаты**
   - Создать parent с collapsed subprocess и child.
   - В child сохранить ручной layout (BPMN с DI).
   - Пересохранить parent, немного изменив семантику subprocess (переименовать задачу).
   - Проверить: уцелевшие элементы имеют ручные координаты.

2. **Регрессионный тест на эталоне 773ec635cf / v15**
   - Unit-test на `preserve_existing_di`: old = grid XML от `extract_subprocess_xml` для collapsed subprocess, new = v15 XML (содержит пользовательский DI).
   - Проверить, что результат содержит координаты v15 для `Event_0ehaumf`, `Activity_12yc0lk`, `Activity_0fpcwm9`, `Activity_1l1h3t3`, `Event_0z8txn9`.
   - Фикстуры — урезанные XML на основе `EVIDENCE/child_v15.xml` и `EVIDENCE/child_773ec635cf.xml`.

3. **Новый элемент в parent появляется в свободной области и не пересекается с сохранёнными**
   - child с DI для A, B, расположенных в (242,212) и (812,212).
   - В parent subprocess добавить C.
   - После merge проверить: bounds A и B не изменились; bounds C не пересекаются с A/B и лежат правее/ниже max сохранённых координат (с шагом grid 120×80).

4. **Перезапись создаёт bpmn_versions snapshot с прежним XML**
   - Создать child, вручную сохранить layout (1 версия).
   - Пересохранить parent.
   - Проверить: появилась версия с `source_action="subprocess_sync"` и прежним XML.

5. **Expanded subprocess не меняет поведение**
   - Parent с expanded subprocess (`isExpanded="true"` + внутренние shape).
   - После синхронизации child содержит DI из expanded shape, а не grid.

6. **Идемпотентность повторной синхронизации**
   - Дважды пересохранить parent без изменений.
   - Количество версий в `bpmn_versions` не растёт.

7. **Waypoints нового edge ведут к финальным координатам концов**
   - child с сохранённым элементом A в (330,190).
   - В parent subprocess добавить новый элемент B и sequenceFlow `Flow_1` A → B.
   - После merge проверить: waypoint начала edge совпадает с центром финальных bounds A, waypoint конца — с центром финальных bounds B (а не с первоначальными grid-позициями).

## Что не входит

- Восстановление уже пострадавших сессий из `bpmn_versions` — отдельное решение пользователя.
- UI / уведомления — контур `feature/subprocess-layout-overwrite-warning` поставлен на паузу.
- Изменение поведения sync кроме сохранения DI и создания версии.

## Гейты

- `pytest backend/tests/test_auto_create_subprocess_sessions.py backend/tests/test_bpmn_navigation_helpers.py` — без новых падений.
- `vite build` frontend — OK (backend-only contour).

## Риски

- `preserve_existing_di` работает по `element id`; если id не уникальны внутри XML, может скопировать не тот shape. BPMN требует уникальности id; `assert_unique_element_id` уже применяется при навигации.
- Версия создаётся техническим `source_action`; она будет видна в `bpmn_versions`, но фильтрация user-facing версий оставит её technical.

## Ссылки

- Audit: `server-backup/srv/obsidian/project-atlas/ProcessMap/AgentReports/audit/subprocess-layout-corruption/AUDIT.md`
- Предыдущий fix upstream sync: `server-backup/srv/obsidian/project-atlas/ProcessMap/Fixes/subprocess-xml-upstream-sync/PR.md`
