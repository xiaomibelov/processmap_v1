# PLAN — fix/subprocess-xml-upstream-sync

## Цель

Изменения в sub-процессе синхронизируются обратно в parent BPMN XML при сохранении.
Export parent не теряет изменения sub-процесса.

## Проблема

- Child BPMN сохранялся в отдельной `sessions` row.
- Parent BPMN оставался stale (старый fragment).
- Export parent BPMN → sub-процесс содержал старые данные.

## Решение

### Backend

1. В `session_bpmn_save` после формирования child XML, но до сохранения child,
   проверяем `parent_session_id` и `element_id_in_parent`.
2. Загружаем parent session, вызываем `re_embed_child_xml_into_parent`:
   - находим `<bpmn:subProcess id="element_id_in_parent">` в parent XML;
   - извлекаем содержимое `<bpmn:process>` из child XML;
   - заменяем детей parent subProcess на детей child process;
   - обновляем `name` у parent subProcess из child process.
3. Сохраняем parent (`st.save`) с bumped `diagram_state_version` и fingerprint.
4. Инвалидируем кеши parent session.
5. Если sync не удался — логируем, но child save всё равно успешен (best-effort).

`callActivity` намеренно пропускается: он ссылается на внешний процесс, inline-вставка
не соответствует семантике BPMN.

### Frontend

В `onSessionSync` при получении `bpmn_xml` активного child удаляем parent запись из
`bpmnXmlCacheRef` и `sessionCacheRef`. Это гарантирует, что при возврате к parent
frontend запросит свежий XML с backend, а не покажет stale cache.

## Изменённые файлы

| Файл | Что изменилось |
|---|---|
| `backend/app/services/bpmn_navigation.py` | Добавлен `re_embed_child_xml_into_parent(parent_xml, element_id, child_xml)`. |
| `backend/app/_legacy_main.py` | `session_bpmn_save` теперь синхронизирует child XML в parent; в ответ добавлены `parent_session_id`, `element_id_in_parent`, `parent_synced`. |
| `frontend/src/App.jsx` | `onSessionSync` инвалидирует parent cache при child save. |
| `backend/tests/test_subprocess_navigation.py` | Добавлен regression test. |

## Критерии приёмки и проверка

| # | Критерий | Проверка |
|---|---|---|
| 1 | Изменения в sub-процессе попадают в parent XML | Backend test: `test_child_bpmn_save_syncs_back_to_parent_subprocess` PASS. |
| 2 | Parent export содержит актуальный fragment | После сохранения child `parent.bpmn_xml` содержит новый `task` id. |
| 3 | Frontend не показывает stale parent | Parent cache очищается в `onSessionSync`. |
| 4 | Child save не ломается при ошибке parent sync | Любое исключение в блоке sync логируется, child сохраняется. |
| 5 | callActivity не inline'ится | `re_embed_child_xml_into_parent` возвращает `None` для `callActivity`. |

## Тесты

```bash
# backend
cd /root/processmap_v1/backend
.venv/bin/python -m pytest tests/test_subprocess_navigation.py -v

# frontend
cd /root/processmap_v1/frontend
node --test src/app/sessionRouteOrchestration.test.mjs
npm run build
```

Результат: backend 7/7 PASS, frontend 13/13 PASS, build OK.

## Риски

- **Race parent+child:** parent sync выполняется без отдельного parent lock. Если parent
  редактируется одновременно, возможен lost update. Для усиления можно добавить
  parent Redis lock или optimistic CAS по `diagram_state_version`.
- **DI parent:** диаграмма parent не обновляет внутренние shape-координаты expanded
  subprocess. Для collapsed subprocess это не критично.
- **callActivity:** не синхронизируется. Если требуется — нужен отдельный контур.

## Статус

Реализация завершена, backend и frontend tests пройдены, build OK. Готово к review.
