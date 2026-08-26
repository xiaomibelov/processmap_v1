# API — feature/product-actions-output-v2

## Новые / изменённые endpoint'ы

### 1. `GET /api/sessions/{session_id}/analysis/product-actions/export`

Выгрузка утверждённых действий текущей сессии в CSV или Excel.

**Query params:**
- `format` — `csv` или `xlsx` (default: `csv`).

**Источник данных:**
1. `interview.analysis.product_actions[]` (если действия уже применены в сессию).
2. Fallback: одобренные (`status=approved`) suggestions, материализованные через `_build_product_action_row`.

**Колонки выгрузки:**
| Колонка | Источник |
|---------|----------|
| process_title | `session.title` |
| product_group | `action.product_group` |
| product_name | `action.product_name` |
| action_text | `action.action_text` |
| action_type | `action.action_type` |
| action_stage | `action.action_stage` |
| action_object | `action.action_object` |
| action_method | `action.action_method` |
| step_label | `action.step_label` |
| role | `action.role` |
| source | `action.source` |
| updated_at | `action.updated_at` |

**Особенности:**
- CSV: UTF-8 BOM, разделитель `;`, кавычки `"`, terminator `\r\n`.
- XLSX: inlineStr, лист «Product actions».

### 2. `POST /api/sessions/{session_id}/analysis/product-actions/suggest`

Сохранена существующая сигнатура. В каждый элемент `suggestions[]` добавлено поле `action_text`.

**Изменения в схеме ответа:**
```json
{
  "suggestions": [
    {
      "id": "ai_pa_1",
      "action_text": "Перелить суп из контейнера в гастроёмкость",
      "action_type": "перетаривание",
      "action_stage": "до разогрева",
      "action_object": "суп",
      "action_method": "перелить",
      "product_name": "",
      "product_group": "",
      "step_id": "...",
      "bpmn_element_id": "...",
      "step_label": "...",
      "role": "...",
      "confidence": 1.0,
      "reason": "...",
      "warnings": [],
      "missing_fields": []
    }
  ]
}
```

**Валидация (`missing_fields`):**
- Обязательны: `action_text`, `action_type`, `action_stage`, `action_object`, `action_method`.
- Необязательны: `product_name`, `product_group`, `action_object_category`.

### 3. `POST /api/sessions/{session_id}/analysis/product-actions/suggestions`

CRUD suggestion. В `action` теперь принимает и сохраняет `action_text`.

### 4. `POST /api/sessions/{session_id}/analysis/product-actions/suggestions/apply`

Без изменений в сигнатуре. Внутри `_build_product_action_row` теперь копирует `action_text` в `interview.analysis.product_actions[]`.

## Prompt registry

- Миграция `030` добавляет `llmprompt_product_actions_suggest_v2` (feature=`product_actions_suggest`, version=2, status=`active`).
- Миграция архивирует `llmprompt_product_actions_suggest_v1`.
- Промпт требует `action_text` и nested `tags` (`action_type`, `action_stage`, `action_object`, `action_method`); backend нормализует nested tags в плоскую структуру для совместимости.

## Модели данных

### Product action row (interview.analysis.product_actions[])

```json
{
  "id": "pa_...",
  "session_id": "...",
  "action_text": "Перелить суп...",
  "product_name": "Суп",
  "product_group": "Супы",
  "action_type": "перетаривание",
  "action_stage": "до разогрева",
  "action_object": "суп",
  "action_object_category": "продукт",
  "action_method": "перелить",
  "step_id": "...",
  "step_label": "...",
  "node_id": "...",
  "bpmn_element_id": "...",
  "role": "...",
  "source": "llm_suggestion",
  "confidence": 1,
  "updated_at": "2026-08-26T...Z"
}
```

### Project passport

Добавлены поля:
- `passport.product_name`
- `passport.product_group`

Используются как источник товара/группы для генерации и выгрузки.
