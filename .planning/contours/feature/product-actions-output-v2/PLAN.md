# PLAN — feature/product-actions-output-v2

> Контур: `feature/product-actions-output-v2`  
> Тип: feature  
> Цель: сделать вкладку AI → «Действия с продуктом» рабочим инструментом-списком: компактный UI, глагольные действия, 4 лейблированных тега, валидация, выгрузка Excel/CSV.  
> Базовая ветка: `main` (`d8f60ca9`, PR #833 вмержен).  
> Статус: фаза 0 — планирование, **код не пишется до явного approve пользователя**.

---

## 1. Проблема (что на stage сейчас)

На stage (`stage.processmap.ru`) генерация действий работает через LLM-шлюз, но результат не соответствует исходной задаче:

- Карточки на всю ширину, по одной в ряд → при 20+ действиях список неюзабелен.
- Заголовок карточки = `product_name`, поэтому при отсутствии товара показывается «Продукт не указан».
- Теги (`action_type`, `action_stage`, `action_object`, `action_method`) рендерятся без лейблов категорий — одинаковые значения выглядят как дубли.
- Этап (`action_stage`) часто пуст, поэтому однотипные действия не различимы.
- Отклонённые карточки сохраняют активные кнопки «Утвердить / Изменить».
- Нет выгрузки Excel/CSV, хотя это формат результата исходной задачи.

Источник истины по исходной задаче: список физических действий сотрудника с продуктом/ингредиентом/полуфабрикатом/блюдом/тарой/упаковкой; по каждому — 4 классифицирующих тега (тип, этап, объект, способ) и формулировка действия; формат — Excel/CSV с колонками товара и группы товара.

---

## 2. Root cause «Продукт не указан»

Доказательства по коду:

1. **Промпт требует `product_name`/`product_group`**, но не требует глагольной формулировки действия.  
   `backend/app/ai/product_actions_suggest.py` (V4, строки 51–89): в схеме ответа есть `product_name`, `product_group`, `action_type`, `action_stage`, `action_object`, `action_object_category`, `action_method`, но **нет поля `action_text`**.
2. **Источника товара/группы в данных процесса/проекта нет.**  
   `frontend/src/features/projects/ProjectWizardForm.jsx` (строки 184–191) содержит поле `passport.product_family` («Продукт или семейство»), но нет отдельных полей `product_name` / `product_group`. В `backend/app/services/product_action_suggestions_service.py` `_build_product_action_row` (строки 32–73) копирует `product_name`/`product_group` из suggestion, а suggestion получает их из LLM.
3. **UI использует `product_name` как заголовок.**  
   `frontend/src/features/process/analysis/ProductActionSuggestionsPanel.jsx` (строка 137): `<span className={styles.suggestionRowProduct}>{productName || "Продукт не указан"}</span>`.
4. **Валидация `missing_fields`** в `backend/app/ai/product_actions_suggest.py` (строка 150) проверяет `product_name`, `product_group`, `action_type`, `action_object`, но не проверяет `action_stage` и `action_method`.

Вывод: проблема не в LLM «не хочет», а в схеме и промпте — они ориентированы на товар как сущность, а не на действие как сущность.

---

## 3. Концепции компактного UI (brainstorming)

### Концепция A — Data-dense table (рекомендуемая)

Одна строка = одно действие. Колонки:

| Действие | Тип | Этап | Объект | Способ | Привязка | Статус | Действия |
|----------|-----|------|--------|--------|----------|--------|----------|
| Перелить суп из контейнера в гастроёмкость | перетаривание | до разогрева | суп | перелить | Залить воду | На рассмотрении | [Утвердить] [Изменить] [Отклонить] |

- Плюсы: максимальная плотность, сортировка по колонкам, единообразие с таблицами реестров (analytics), легко делать массовые действия.
- Минусы: на мобильных нужна горизонтальная прокрутка (приемлемо для рабочего инструмента).

### Концепция B — Compact grouped list

Группировка по этапу/типу, внутри группы — плотные строки без таблицы:

```
[До разогрева]
  Перелить суп…  [тип: перетаривание] [объект: суп] [способ: перелить] → Залить воду [Утвердить]
  Надрезать упаковку рыбы… [тип: вскрытие] [объект: упаковка рыбы] [способ: надрез ножом] → Промыть [Утвердить]
```

- Плюсы: визуально разделяет этапы, хорошо для 10–15 действий.
- Минусы: сложнее сортировка, меньше действий на экране, сложнее массовый экспорт.

### Концепция C — Hybrid: table + grouped headers

Таблица, но с sticky-группировкой по `action_stage` (как в реестре свойств). Сохраняет плотность A и визуальное разделение B, но требует больше кода.

**Выбор: концепция A** — потому что критерий «в 2–3 раза больше действий на экране» важнее группировки, и у проекта уже есть компонент таблиц (`analysisTable*` в `ProcessAnalysis.module.css`). Группировку можно добавить позже как отдельный микро-контур.

---

## 4. Схема данных

### 4.1 Добавляемое поле: `action_text`

Единая схема на фронте и бэке:

```ts
{
  id: string;
  session_id: string;
  action_text: string;              // NEW: глагольная формулировка физического действия
  tags: {
    action_type: string;            // тип (вскрытие, перекладывание...)
    action_stage: string;           // этап (до разогрева, сборка...)
    action_object: string;          // объект (суп, рис, курица...)
    action_object_category: string; // категория объекта (продукт, ингредиент...)
    action_method: string;          // способ (перелить, щипцами...)
  };
  binding: {
    step_id: string;
    step_label: string;
    node_id: string;
    bpmn_element_id: string;
  };
  product_name?: string;            // опционально: товар из паспорта/ручной ввод
  product_group?: string;           // опционально: группа товара
  role?: string;
  source: "ai_suggested" | "manual";
  confidence: number;
  status: "pending" | "approved" | "rejected";
  updated_at: string;
}
```

### 4.2 Источник «товара» и «группы товара»

Варианты:

1. **Добавить поля в паспорт проекта** (рекомендуемое): `passport.product_name` и `passport.product_group`. Использовать их как fallback/default при генерации. UI панели AI позволяет переопределить вручную при редактировании suggestion.
2. **Только ручной ввод в панели AI**: проще, но не масштабируется на multi-process export.
3. **Извлекать из BPMN/шагов**: ненадёжно, LLM уже показал, что не может стабильно.

**Решение в PLAN.md: вариант 1** — добавить в `ProjectWizardForm` два поля:
- `passport.product_name` — «Наименование товара»
- `passport.product_group` — «Группа товара»

Для существующих проектов — fallback на `passport.product_family` как `product_group`, а `product_name` остаётся пустым до ручного заполнения.

### 4.3 Нормализация / валидация

- `frontend/src/features/process/analysis/productActionsModel.js`: добавить `action_text` в `normalizeProductActionRow`.
- `backend/app/ai/product_actions_suggest.py`: обновить `_SUGGESTION_FIELDS` и `missing_fields`.
- `backend/app/services/product_action_suggestions_service.py`: `_build_product_action_row` добавляет `action_text`.

---

## 5. Промпт (prompt registry)

### 5.1 Что меняется

- Новая миграция `backend/alembic/versions/030_product_actions_output_v2_prompt.py`:
  - Создаёт версию 2 промпта `product_actions_suggest`.
  - Деактивирует версию 1 (`status='archived'`).
  - Добавляет `action_text` в схему ответа.
  - Требует заполнения всех 4 тегов (`action_type`, `action_stage`, `action_object`, `action_method`).
  - Включает few-shot примерами из исходной задачи.
  - Сохраняет `{input}` плейсхолдер для gateway.

- Примерный фрагмент нового промпта:

```
Ты помогаешь составить список физических действий сотрудника с продуктом/ингредиентом/полуфабрикатом/блюдом/тарой/упаковкой по шагам пищевого процесса.

Для каждого действия верни:
- action_text: глагольная формулировка физического действия (например, "Перелить суп из контейнера в гастроёмкость").
- tags: { action_type, action_stage, action_object, action_method }.
- product_name, product_group: из контекста проекта/шага; если неизвестно — пустая строка.
- step_id, bpmn_element_id, step_label, role, confidence, reason.

Примеры:
- action_text: "Перелить суп из контейнера в гастроёмкость"
  tags: { action_type: "перетаривание", action_stage: "до разогрева", action_object: "суп", action_method: "перелить" }
- action_text: "Надрезать упаковку рыбы ножом"
  tags: { action_type: "вскрытие", action_stage: "до разогрева", action_object: "упаковка рыбы", action_method: "надрез ножом" }
- action_text: "Нарезать куриную грудку ножом"
  tags: { action_type: "нарезка", action_stage: "подготовка", action_object: "куриная грудка", action_method: "нарезать ножом" }

Правила:
- action_text — обязательно, не более 120 символов.
- Все 4 тега обязательны; если неизвестно — пустая строка и низкая confidence.
- Не придумывай товары/группы; если в шаге нет продуктового контекста — пропусти шаг.
- Не повторяй уже утверждённые product_actions без явной новой детали.
- Return only valid JSON object. No markdown, no comments.

{input}
```

### 5.2 Feature flag

- `llm_feature_flags.product_actions_suggest` уже есть (миграция 029). Миграция 030 не меняет лимит, только обновляет промпт.

---

## 6. UI — детальные решения

### 6.1 Таблица предложений

- Новый компонент `ProductActionSuggestionsTable` внутри `ProductActionSuggestionsPanel`.
- Использовать существующие CSS-классы `analysisTableWrap`, `analysisTable`, `analysisTableHead`, `analysisTableBody`, `analysisTableRow` из `ProcessAnalysis.module.css`.
- Колонки:
  1. **Действие** (`action_text`) — основная ячейка, wrap-текст.
  2. **Тип** — чип с лейблом «Тип: X».
  3. **Этап** — чип с лейблом «Этап: X».
  4. **Объект** — чип с лейблом «Объект: X».
  5. **Способ** — чип с лейблом «Способ: X».
  6. **Привязка** (`step_label`).
  7. **Статус** — бейдж (`pending` / `approved` / `rejected`).
  8. **Действия** — кнопки в зависимости от статуса.

### 6.2 Режим редактирования

- По кнопке «Изменить» строка переключается в режим inline-формы (input/select для каждого тега + `action_text` + привязка).
- «Готово» сохраняет; «Отмена» — отбрасывает локальные изменения.

### 6.3 Статусы и кнопки

- `pending`: [Утвердить] [Отклонить] [Изменить].
- `approved`: статус-бейдж + [Изменить] [Снять утверждение].
- `rejected`: строка приглушена (`opacity: 0.7`), кнопки «Утвердить/Отклонить» скрыты, остаётся [Вернуть на рассмотрение] + [Изменить].

### 6.4 Валидация перед утверждением

- «Утвердить» недоступна (disabled с tooltip), пока не заполнены:
  - `action_text`
  - `action_type`, `action_stage`, `action_object`, `action_method`
  - привязка к шагу (`step_id`/`node_id`)
- Невалидные строки помечаются иконкой/тултипом «уточнить».
- Массовое «Утвердить всё» утверждает только валидные; невалидные остаются `pending`.

### 6.5 Сводка и массовые действия

- Сохранить сводку «Всего / На рассмотрении / Утверждено / Отклонено».
- Добавить кнопки: [Утвердить всё валидное] [Отклонить всё] [Сгенерировать].
- RAG-статус-бар остаётся внизу панели (не ломать).

### 6.6 i18n

- Все новые строки добавляются в `frontend/src/shared/i18n/ru.js` и `frontend/src/shared/i18n/en.js` под префиксом `processAnalysis.ai.*`.
- Ни одного хардкод-русского текста в JSX.

---

## 7. Экспорт Excel/CSV (блок C)

### C1 — выгрузка утверждённых действий текущей сессии (входит в этот PR)

- **Backend**: новый endpoint `POST /api/sessions/{session_id}/analysis/product-actions/export` с query-параметром `format=(csv|xlsx)`.
  - Источник: `interview.analysis.product_actions[]` текущей сессии (только `approved`, если применены; иначе — текущие `approved` suggestions).
  - Колонки: Процесс | Группа товара | Товар | Действие | Тип | Этап | Объект | Способ | Шаг процесса | Роль | Источник | Дата обновления.
  - Реализация: адаптировать `_csv_bytes`/`_xlsx_bytes` из `backend/app/routers/product_actions_registry.py` или переиспользовать их, передавая session-scoped rows.
- **Frontend**: кнопка «Выгрузить» рядом со сводкой; dropdown CSV / Excel; скачивание через `URL.createObjectURL`.
- **Проверка**: сгенерированный файл открывается в Excel без танцев; CSV — UTF-8 BOM.

### C2 — multi-process/multi-session export (вынесен в отдельный контур)

- Текущий `product_actions_registry.py` уже умеет `scope=workspace|project|session` и фильтры, но UI выбора нескольких сессий/процессов и bulk-экспорт требует:
  - нового экрана/модалки в реестре действий (analytics → actions);
  - отдельного дизайн-решения по выбору scope и фильтрам;
  - отдельного тестового контура.
- **Решение в PLAN.md: C2 — отдельный contour `feature/product-actions-bulk-export-v2`**, который переиспользует существующий `/api/analysis/product-actions/registry/export.*` и добавляет UI выбора. В этом PR — только C1.

---

## 8. Тесты

### 8.1 Регрессионные (держим зелёными)

- `frontend/src/features/process/analysis/analysisTabsI18n.smoke.test.mjs` — смоук 6 сабтабов.
- `frontend/src/features/process/analysis/productActionSuggestionsPanel.error.test.mjs` — error-copy.
- `frontend/src/features/process/analysis/productActionsModel.test.mjs` — модель.
- `frontend/src/features/process/analysis/productActionsPersistence.test.mjs` — persist.
- `frontend/src/features/process/analysis/processAnalysisModel.test.mjs` — derived model.
- `frontend/src/features/process/analysis/productActionSuggestionsPanel.source.test.mjs` — source tests.
- `frontend/src/features/process/analysis/processAnalysisPage.test.mjs` — page render.
- `frontend/src/features/process/analysis/processAnalysisDashboard.test.mjs` — dashboard.
- `backend/tests/test_llm_gateway.py`, `backend/tests/test_llm_provider_resolution.py` — шлюз.
- `backend/tests/test_ai_prompt_registry_foundation.py`, `backend/tests/test_ai_prompt_registry_seeds.py` — prompt registry.

### 8.2 Новые тесты

1. **Схема suggest-ответа** (`backend/tests/test_product_actions_suggest_v2.py`):
   - ответ без `action_text` → маркируется невалидным;
   - ответ без любого из 4 тегов → `missing_fields` содержит это поле;
   - `action_text` сохраняется в suggestion и попадает в product_action row.
2. **Промпт в registry** (`backend/tests/test_ai_prompt_registry_seeds.py` или новый):
   - активный промпт `product_actions_suggest` версии ≥2 содержит `action_text`, таксономию 4 категорий и few-shot примеры.
3. **UI: компактная таблица** (`frontend/src/features/process/analysis/productActionSuggestionsPanel.table.test.mjs`):
   - рендерит `action_text` в первой колонке;
   - теги рендерятся с лейблами категорий;
   - отклонённые строки не содержат кнопок «Утвердить/Изменить» одновременно;
   - кнопка «Утвердить» disabled для невалидной строки.
4. **UI: валидация** (`frontend/src/features/process/analysis/productActionSuggestionsPanel.validation.test.mjs`):
   - массовое «Утвердить всё» утверждает только валидные;
   - невалидные остаются `pending` с маркером.
5. **Экспорт** (`backend/tests/test_product_actions_session_export.py`):
   - endpoint возвращает CSV/XLSX;
   - CSV начинается с BOM, содержит колонки «Действие», «Тип», «Этап», «Объект», «Способ»;
   - xlsx открывается (минимальная валидация структуры ZIP + sheet1.xml).
6. **i18n-leak**:
   - расширить `analysisTabsI18n.smoke.test.mjs` проверкой отсутствия сырых ключей `processAnalysis.ai.*` в рендере AI-панели.
7. **Сборка фронта** без warning'ов по i18n (`npm run build`).

---

## 9. Файлы, которые будут изменены

### Backend

- `backend/alembic/versions/030_product_actions_output_v2_prompt.py` — новая миграция.
- `backend/app/ai/product_actions_suggest.py` — схема + валидация + `action_text`.
- `backend/app/services/product_action_suggestions_service.py` — `_build_product_action_row` + валидация.
- `backend/app/routers/product_action_suggestions.py` — export endpoint (C1).
- `backend/app/routers/product_actions_registry.py` — возможно, вспомогательные функции экспорта.

### Frontend

- `frontend/src/features/process/analysis/ProductActionSuggestionsPanel.jsx` — новая таблица, валидация, экспорт.
- `frontend/src/features/process/analysis/ProcessAnalysis.module.css` — стили таблицы/строк/тегов (минимально).
- `frontend/src/features/process/analysis/useProcessAnalysisI18n.js` — не меняется, но новые ключи должны резолвиться.
- `frontend/src/shared/i18n/ru.js` — новые ключи.
- `frontend/src/shared/i18n/en.js` — новые ключи.
- `frontend/src/features/process/analysis/productActionsModel.js` — `action_text` + валидация.
- `frontend/src/features/projects/ProjectWizardForm.jsx` — поля `product_name`, `product_group` в паспорте.
- `frontend/src/lib/api.js` — функция экспорта сессионных действий.
- `frontend/src/lib/apiRoutes.js` — новый route.

### Tests

- Новые файлы, перечисленные в разделе 8.

### Артефакты контура

- `.planning/contours/feature/product-actions-output-v2/PLAN.md` (этот файл)
- `API.md`, `UI.md`, `TESTS.md`, `REGRESSION.md`, `PR.md`, `evidence/` — после approve и реализации.

---

## 10. Критерии приёмки (маппинг на исходную задачу)

- [ ] Список содержит действия (глагольные формулировки), а не продукты: «Перелить суп…», а не «суп».
- [ ] У каждого действия 4 лейблированных тега: тип / этап / объект / способ; «Продукт не указан» заменён на заполнение или явный «уточнить» + редактирование.
- [ ] Однотипные действия различимы по этапу и способу.
- [ ] UI компактный: таблица, ≥ в 2–3 раза больше действий на экране, чем сейчас; отклонённые — без активных кнопок.
- [ ] Выгрузка Excel/CSV открывается; колонки включают товар, группу товара, действие и 4 тега; утверждаются/выгружаются только валидные действия.
- [ ] Промпт — в prompt registry, без хардкода таксономии в коде фичи.
- [ ] Multi-process выгрузка: вынесена в отдельный контур (этот PR — C1).
- [ ] E2E на stage после мержа: генерация → правка → утверждение валидных → выгрузка файла → скриншоты + сам файл в evidence/.
- [ ] Ни один i18n-ключ не рендерится сырым.
- [ ] Консоль чистая на всех шагах смоук-чеклиста.

---

## 11. Что требуется от пользователя

1. **Approve этого PLAN.md** — после этого начинаю писать код.
2. **Решение по C2**: согласны ли вынести multi-process export в отдельный контур `feature/product-actions-bulk-export-v2`?
3. **Решение по паспорту проекта**: согласны ли добавить `product_name` и `product_group` в `ProjectWizardForm`? Или предпочитаете оставить их только ручным вводом в панели AI?
4. **Stage-креды** для E2E: email/password пользователя в орг «Роботизация производств» (или актуальная сессия/cookie) — понадобятся после реализации для прогона.

---

## 12. Риски и ограничения

- **LLM-поведение**: даже с новым промптом LLM может иногда возвращать пустые теги. Валидация и UI-маркеры «уточнить» должны это перехватывать, но качество генерации зависит от провайдера.
- **Обратная совместимость**: старые `product_actions` без `action_text` будут отображаться с пустой колонкой «Действие» и маркером «уточнить» до ручного заполнения.
- **Scope C2**: bulk-export затрагивает реестр analytics/actions, который сейчас вне панели AI. Вынесение в отдельный контур снижает риск регрессии.

---

*Фаза 0 завершена. Код не пишется до явного approve пользователя.*
