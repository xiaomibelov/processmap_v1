# BPMN_XML_VS_PROPERTIES.md — где хранятся properties

## Источник правды

**Авторитетный источник для instance-значений свойств:** `sessions.bpmn_meta_json → camunda_extensions_by_element_id`.

Справочные данные (ингредиенты, оборудование, контейнеры) живут в отдельных таблицах, но факт привязки к элементу хранится в JSON `bpmn_meta`.

## Схема хранения

| Данные | Таблица / колонка | Пример |
|---|---|---|
| BPMN XML диаграммы | `sessions.bpmn_xml` | `<bpmn:task id="Activity_1">...` |
| Значения свойств элементов | `sessions.bpmn_meta_json` | `camunda_extensions_by_element_id.Activity_1.properties` |
| Справочник ингредиентов | `ingredients` | `id, name, unit, ...` |
| Справочник оборудования | `equipment` | `id, name, type, ...` |
| Справочник контейнеров | `containers` | `id, name, volume, ...` |
| Метаданные property types | `process_property_metadata` | `display_name, property_type, applicable_to` |

## Загрузка: DB → Modeler

При открытии сессии frontend берёт `bpmn_xml` и `bpmn_meta`, затем инжектирует properties в XML перед подачей в bpmn-js:

```js
// frontend/src/components/process/BpmnStage.jsx
function transformPersistedXml(xmlText) {
  return finalizeCamundaExtensionsXml({
    xmlText,
    camundaExtensionsByElementId: getCamundaExtensionsMap(),
    preserveManagedForElementIds: templateInsertGuardIds,
  });
}
```

То есть modeler видит XML **с уже встроенными** `camunda:properties`, но это производное от DB.

## Сохранение: Form → DB

Property panel не мутирует modeler напрямую. Вместо этого:

1. Форма строит новый `camunda_extensions_by_element_id`.
2. `persistCamundaExtensionsViaCanonicalXmlBoundary` вызывает `finalizeCamundaExtensionsXml(currentXml, newExtensions)`.
3. Полученный XML и полный `bpmn_meta` PUT-ятся на `PUT /api/sessions/{sid}/bpmn`.
4. Backend сохраняет `bpmn_xml` (перезаписывает) и `bpmn_meta_json` (мержит).

## Импорт XML: XML → DB

Если импортируется XML со свойствами, а в сессии их ещё нет, frontend делает "hydration":

```js
hydrateCamundaExtensionsFromImportedBpmn(xmlText, source = "import_xml")
```

`hydrateCamundaExtensionsFromBpmn` использует `session_wins` — если в `bpmn_meta` уже есть свойства для элемента, они не перезаписываются импортированными.

## Перезаписывает ли BPMN XML save отдельно хранимые properties?

**Нет**, если save приходит с корректным `bpmn_meta`:
- `session_bpmn_save` мержит incoming `bpmn_meta` с текущим.
- `camunda_extensions_by_element_id` сохраняется, если присутствует в payload.

**Но:** если внешний клиент сохранит XML без `camunda_extensions_by_element_id`, backend оставит старые значения в `bpmn_meta_json`. При следующей загрузке frontend всё равно переинжектирует их в XML.

## Проблемы текущей схемы

1. **Двойное хранение.** Свойства есть и в `bpmn_meta_json`, и (временно) в XML. Несоответствие сериализации приводит к "призрачным" изменениям.
2. **Тяжёлый save.** Каждое изменение свойства перезаписывает всё BPMN XML.
3. **Truth source не очевиден.** Новый разработчик может подумать, что properties в XML, а не в JSON.
4. **Сложная merge-логика.** `finalizeCamundaExtensionsXml` должна сохранить unmanaged extension elements (коннекторы, custom extensions) и заменить managed. Это хрупко.
