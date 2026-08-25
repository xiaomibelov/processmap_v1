# ROOT_CAUSE.md — `filterSummary is not defined`

**Контур:** fix/actions-tab-filter-summary  
**Симптом:** на stage после merge PR #830 сабтаб «Действия» падает с `ReferenceError: filterSummary is not defined`.

---

## 1. Где читается

```
frontend/src/components/process/interview/TimelineControls.jsx:455
          title={filterSummary}
```

Используется в `title` кнопки «Дополнительно» (advanced-фильтры).

## 2. Где (не) определяется

`grep -rn "filterSummary" frontend/src` до фикса давал **ровно одно** совпадение — строку чтения. Объявление отсутствовало.

## 3. Почему возникло

При рефакторе toolbar'а в PR #830 (двухуровневый toolbar) строка `title={filterSummary}` была оставлена без соответствующего объявления переменной. Рядом в том же компоненте уже вычислялся `activeFilterChips` — массив текстовых описаний активных фильтров. `filterSummary` логично должна была быть свёрткой этого массива.

## 4. Почему прошло мимо тестов

- `npm run build` не проверяет runtime-переменные — Vite транспилирует код без ошибок.
- `vitest` в проекте не стартует из-за pre-existing `ERR_REQUIRE_ESM` (`html-encoding-sniffer` ↔ `@exodus/bytes/encoding-lite.js`), поэтому существующий `TimelineControls.smoke.test.jsx` не выполнялся в CI/локально.
- Не было source-теста на отсутствие необъявленных идентификаторов в JSX.

## 5. Доказательства

- Скриншот/лог пользователя: `ReferenceError: filterSummary is not defined at stt (index-C9ZZYk-N.js:52:233060)`.
- `grep` до фикса: одно совпадение, только чтение.
- После фикса: объявление `filterSummary` через `useMemo` добавлено до использования; source-тест проходит.
