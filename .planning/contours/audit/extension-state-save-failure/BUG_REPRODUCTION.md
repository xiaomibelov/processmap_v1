# BUG_REPRODUCTION.md — BPMN extension-state / properties save failure

## Описание бага
При редактировании свойств BPMN-элемента в правой панели свойств изменения остаются в форме, но не сохраняются на сервере. Пользователь видит статус ошибки:

> **"Не удалось сохранить extension-state. Изменения остались в форме."**

Обычное сохранение BPMN XML (autosave / Ctrl+S / кнопка сохранения диаграммы) работает корректно.

## Где воспроизводится
- **stage.processmap.ru** — требуется проверка (необходимы логи и скриншоты).
- **clearvestnic.ru:5177** — требуется проверка (test-stand).
- Локально — можно воспроизвести через UI property panel + Network tab.

## Шаги воспроизведения
1. Открыть любую сессию с BPMN-диаграммой.
2. Выделить элемент (чаще всего `bpmn:Task`, `bpmn:UserTask` или `bpmn:SubProcess`).
3. Открыть правую панель свойств (`ElementSettingsControls` / `CamundaPropertiesSettings`).
4. Изменить любое свойство, например:
   - `extensionProperties` → ingredient / equipment / container
   - Camunda execution listener
   - Input/Output parameter
   - Zeebe task header
5. Нажать **"Сохранить"** или **Enter**.
6. Наблюдать:
   - форма остаётся заполненной новым значением,
   - статус переходит в "Ошибка" с helper-text выше,
   - после обновления страницы изменения пропадают.

## Что нужно зафиксировать при воспроизведении
- Network tab: запрос `PUT /api/sessions/{sid}/bpmn` (reason = `manual_save:camunda_extensions`).
- Статус ответа: 200 / 400 / 409 / 423 / 500.
- Response body: code (`DIAGRAM_STATE_CONFLICT`, `DIAGRAM_STATE_BASE_VERSION_REQUIRED`, validation error).
- Значения `base_diagram_state_version` в request body и `diagram_state_version` в response.
- Console errors / toast messages.
- Скриншот property panel до и после.

## Предполагаемые сценарии воспроизведения
| Сценарий | Причина | Ожидаемый HTTP статус |
|---|---|---|
| Открыт элемент, изменено свойство, нажато Сохранить | 409 CAS conflict из-за устаревшего `draft.diagram_state_version` | 409 |
| Автосейв диаграммы выполняется одновременно | 423 Redis lock "Session is being updated" | 423 |
| Свойство нормализуется к пустому/тождественному значению | Boundary отвергает сохранение как "XML не изменился" | 0 (локальная ошибка) |
| Ошибка валидации / размер payload | 400 / 500 | 400/500 |

## Примечание
Полноценное воспроизведение с логами и скриншотами требует доступа к stage/test-stand. Данный документ содержит реконструкцию по коду.
