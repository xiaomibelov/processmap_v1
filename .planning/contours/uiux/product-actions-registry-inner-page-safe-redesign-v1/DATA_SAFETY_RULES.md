# DATA_SAFETY_RULES — правила безопасности данных

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
**Run ID:** `20260517T134517Z-85981`  
**Agent:** Agent 3 / Executor Part 2  
**Дата:** `2026-05-17`

## Принцип

UI/layout rework не создает данные и не подменяет durable truth. Все числа, строки, статусы, export и AI-selection counters должны быть следствием backend data flow или явного пустого состояния.

## Правила для runtime/code review

| # | Правило | Критичность | Проверка |
|---|---|---|---|
| 1 | Все числа в метриках — реальные агрегаты из backend или «—» при пустом наборе | Critical | Сравнить UI metrics с response registry query |
| 2 | Запрещены `Math.random()`, `faker`, `placeholder`, `lorem ipsum` для данных реестра | Critical | `rg "Math\\.random|faker|placeholder|lorem ipsum|mockData|demo" frontend/src/components/process/analysis` |
| 3 | «Выбрано для AI» отражает реальное число выбранных чекбоксов | Critical | Выбрать 1/3/0 строк и сравнить счетчик |
| 4 | CSV/XLSX export содержит реальные строки таблицы | Critical | Скачать export и сравнить строки/фильтры с UI |
| 5 | «Полная» / «Неполная» соответствуют backend flag | Critical | Сравнить row status с response field (`is_complete` или канонический аналог) |
| 6 | Фильтры применяются к реальному dataset | High | Фильтр меняет rows и «После фильтров» согласованно |
| 7 | Empty state не выглядит как fake dataset | High | При пустом response нет demo rows; показан честный empty/placeholder state без fake numbers |
| 8 | Registry не мутирует sessions/BPMN при read/filter/export | Critical | Network: 0 PUT `/bpmn`, 0 PATCH `/sessions` от registry interactions |

## Запрещенные паттерны

```javascript
const metrics = { sessions: 123, rows: 456 };
const rows = Array.from({ length: 10 }, buildMockRow);
const count = Math.floor(Math.random() * 100);
const status = row.name ? "Полная" : "Неполная";
import { faker } from "@faker-js/faker";
```

## Допустимые паттерны

```javascript
const metrics = registryResponse.metrics;
const rows = registryResponse.rows;
const selectedCount = selectedRowIds.size;
const status = row.is_complete ? "Полная" : "Неполная";
```

## Reviewer fail conditions

- UI displays numeric metrics that cannot be traced to backend response.
- Export includes rows that are not present in current filtered dataset.
- Status chips are inferred from frontend presentation text instead of backend completeness flag.
- Any registry load/filter/export operation writes durable session/BPMN data.
