# BPMN extension-state / properties save failure — executive summary

## Статус
Аудит завершён, код продукта не изменялся. Диагностика показала, что сохранение свойств **не использует отдельный extension-state endpoint**, а идёт через тот же `PUT /api/sessions/{sid}/bpmn`, что и обычное сохранение BPMN XML, но с отдельным frontend-boundary (`persistCamundaExtensionsViaCanonicalXmlBoundary`).

## Главный вывод
Система хранит значения свойств в `sessions.bpmn_meta_json → camunda_extensions_by_element_id` (JSON), а каноническое BPMN-XML формируется на лету при сохранении через `finalizeCamundaExtensionsXml`. Это создаёт несколько точек отказа, которых нет у «простого» BPMN XML save:

1. **Необходимость изменить XML.** `camundaExtensionsSaveBoundary` сначала строит новый XML и отказывает сохранять, если `nextXml === currentXml` (`"Изменения Properties не применились к BPMN XML"`).
2. **Работа с устаревшим `draft`.** Property panel берёт `baseDiagramStateVersion` из `draft?.diagram_state_version`. Если локальный `draft` отстаёт от сервера (автосейв в полёте, фоновая синхронизация), PUT получает 409. Retry есть, но он требует успешного `apiGetSession` и успешного перестроения XML на свежем XML.
3. **Race condition с автосейвом.** Property save и modeler autosave используют один Redis-lock на session (`acquire_session_lock`). При одновременном сохранении property save может получить 423 "Session is being updated".
4. **Отсутствие dedicated маршрута для properties.** Все свойства протаскиваются через `bpmn_meta` внутри BPMN XML save. Это делает property save тяжёлым (перезаписывается всё XML) и уязвимым к конфликтам общего state.
5. **Truth source двойственна.** Авторитетный источник — `bpmn_meta.camunda_extensions_by_element_id`, но при загрузке свойства инжектируются в XML через `finalizeCamundaExtensionsXml`. Любой баг в сериализации/нормализации приводит к тому, что форма показывает одно, а сохранение видит другое.

## Что подтверждено
- Backend endpoint `PUT /api/sessions/{sid}/bpmn` (`session_bpmn_save`) корректно сохраняет `camunda_extensions_by_element_id` в `bpmn_meta_json` и отдаёт `diagram_state_version`.
- `camundaExtensionsSaveBoundary` unit-тесты проходят (retry на 409, durable ack, background refresh).
- `camundaExtensions.test.mjs` не запускается в окружении Node 18 из-за `jsdom`/`html-encoding-sniffer` ESM-проблемы — это не причина бага, но блокирует frontend unit-покрытие.

## Что не удалось проверить без stage-логов
- Точный HTTP-статус и response body в момент ошибки у пользователя.
- Конкретное состояние `draft.diagram_state_version` vs серверного `diagram_state_version` в момент сбоя.
- Логи backend (`backend/logs/`) на предмет 409/423/500.

## Следующий шаг
Рекомендуется включить детальное логирование в `persistCamundaExtensionsViaCanonicalXmlBoundary` и `session_bpmn_save` для фиксации статуса, base version и размера payload в момент ошибки. После этого — реализовать P1 fix (см. `RECOMMENDATIONS.md`).
