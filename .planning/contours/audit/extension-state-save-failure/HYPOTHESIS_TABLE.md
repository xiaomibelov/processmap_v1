# HYPOTHESIS_TABLE.md — H1-H8

| ID | Гипотеза | Статус | Доказательства |
|---|---|---|---|
| H1 | Property save падает из-за 409 CAS conflict, потому что `draft.diagram_state_version` устарел относительно сервера. | **Вероятно** | `setElementCamundaExtensions` берёт версию из `draft` (`App.jsx:2569`). Автосейв и background refresh могут обновлять `draft` неатомарно. Boundary делает retry, но если retry тоже получает 409, пользователь видит ошибку. |
| H2 | Property save падает из-за 423 Redis lock, когда одновременно работает автосейв диаграммы. | **Возможно** | `session_bpmn_save` использует `acquire_session_lock` (15s). Autosave и property save — один lock. Но пользователь сообщает, что обычный BPMN save работает, а property save нет; 423 была бы видна в Network tab. |
| H3 | `finalizeCamundaExtensionsXml` не изменяет XML (`nextXml === currentXml`), и boundary отклоняет сохранение. | **Возможно** | Boundary явно проверяет `nextXml === currentXml` и возвращает `"Изменения Properties не применились к BPMN XML"`. Это может случиться при пустой/идентичной нормализации или отсутствии элемента в XML. |
| H4 | Backend отбрасывает `camunda_extensions_by_element_id` при нормализации. | **Опровергнута** | `_normalize_bpmn_meta` пропускает unknown keys, включая `camunda_extensions_by_element_id`. Backend unit-проверка показала, что JSON сохраняется корректно. |
| H5 | Properties сохраняются в `bpmn_xml`, но перезаписываются при следующем BPMN XML save. | **Опровергнута** | Truth source — `bpmn_meta.camunda_extensions_by_element_id`. Frontend заново инжектирует properties в XML при загрузке. Обычный BPMN XML save мержит `bpmn_meta`. |
| H6 | Context-menu overlay и property panel пишут в разные источники, и modeler state расходится с DB. | **Возможно** | Overlay мутирует modeler через `modeling.updateProperties`; property panel пишет в `bpmn_meta`. Autosave может сохранить modeler state без новых properties из формы. |
| H7 | Property payload слишком большой / содержит невалидные символы, и backend отвечает 400/500. | **Маловероятно, но возможно** | `BpmnXmlIn` не валидирует содержимое `bpmn_meta`. Размер XML ограничен только БД/сетью. Без логов не подтвердить. |
| H8 | Unit-тест `camundaExtensions.test.mjs` не запускается в Node 18, поэтому regression в сериализации properties не отлавливается. | **Подтверждена** | Запуск теста падает с `ERR_REQUIRE_ESM` в `html-encoding-sniffer`. Это не root cause, но увеличивает риск незамеченных багов в property serialization. |

## Наиболее вероятные root cause

1. **H1 (stale base version)** — высокая вероятность, особенно при фоновых синхронизациях.
2. **H3 (XML unchanged)** — средняя вероятность, если свойство не проходит нормализацию или элемент отсутствует в текущем XML.
3. **H2 (Redis lock / 423)** — низкая/средняя, зависит от частоты autosave.

## Что нужно для подтверждения

- Network tab с ошибкой (статус + response body).
- Значения `base_diagram_state_version` в request и `diagram_state_version` в response.
- Логи backend за период ошибки.
- Состояние `draft` (React DevTools / console.log).
