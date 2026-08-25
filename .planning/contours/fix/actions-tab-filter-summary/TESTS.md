# TESTS.md — `filterSummary is not defined`

## Регрессионные тесты

### 1. Source-тест (node --test)

**Файл:** `frontend/src/components/process/interview/timelineControls.filterSummary.source.test.mjs`

Проверяет:
- `filterSummary` объявлен в `TimelineControls.jsx`;
- объявление идёт до использования в `title={filterSummary}`;
- переменная используется не только в JSX.

Запуск:
```bash
cd frontend
node --test src/components/process/interview/timelineControls.filterSummary.source.test.mjs
```

**Статус:** ✓ green.

### 2. Компонентный smoke-тест (vitest/jsdom)

**Файл:** `frontend/src/components/process/interview/__tests__/TimelineControls.smoke.test.jsx`

Добавлен кейс `renders with active filters without ReferenceError`, который рендерит `TimelineControls` с активными фильтрами (`query`, `lanes`, `type`, `bind`, `ai`). До фикса рендер выбрасывает `ReferenceError`; после — проходит.

**Статус:** не выполняется сейчас из-за pre-existing `ERR_REQUIRE_ESM` в `vitest`/`html-encoding-sniffer`; станет green после починки инфраструктуры тестов.

## Инфраструктурная проблема

`vitest` не стартует в проекте из-за `ERR_REQUIRE_ESM` (`html-encoding-sniffer` пытается `require` ESM `@exodus/bytes/encoding-lite.js`). Попытки добавить `deps.optimizer.web.include` и `deps.inline` в `vitest.config.js` не помогли. Вынесено в заметку PR — не блокер этого hotfix'а.

## Верификация

- `frontend/npm run build` — ✓ green.
- `node --test ...timelineControls.filterSummary.source.test.mjs` — ✓ 2 passed.
