# FIX.md — `filterSummary is not defined`

## Патч

`frontend/src/components/process/interview/TimelineControls.jsx`

Добавлено объявление `filterSummary` через `useMemo` сразу после `activeFilterChips`:

```js
const filterSummary = useMemo(() => {
  if (!activeFilterChips.length) return "Дополнительные фильтры";
  return activeFilterChips.join("; ");
}, [activeFilterChips]);
```

`title` кнопки «Дополнительно» теперь получает корректную строку с описанием активных фильтров.

## Почему так

- Минимальное изменение: используем уже вычисленный `activeFilterChips`.
- Не затрагивает логику фильтрации, режимы отображения, companion-панели.
- Стабильный `useMemo` предотвращает лишние ререндеры.
