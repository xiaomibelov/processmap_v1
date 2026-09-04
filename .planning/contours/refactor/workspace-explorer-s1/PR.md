# PR: refactor/workspace-explorer-s1

**Шаг Ш1 из DECOMP.md** (`audit/workspace-explorer-decomposition`, 18 шагов + Ш0 + Ш15′).

## Что перенесено

- 13 SVG-иконок (`IcoFolder`, `IcoProject`, `IcoSession`, `IcoChevron`,
  `IcoTreeBulk`, `IcoArrowLeft`, `IcoSpinner`, `IcoWorkspace`, `IcoPlus`,
  `IcoSearch`, `IcoTrash`, `IcoEdit`, `IcoMove`):
  `frontend/src/features/explorer/WorkspaceExplorer.jsx` (было строки 177–290
  по baseline Ш0; DECOMP указывал 178–292) →
  **`frontend/src/features/explorer/components/explorerIcons.jsx`** (named exports).
- Перенос **построчный, verbatim** — верифицировано механически:
  `diff` блока из `git show HEAD` против нового файла пуст
  (единственное отличие — ключевое слово `export` и заголовок-импорт `React`).
- В `WorkspaceExplorer.jsx` блок удалён, добавлен один именованный импорт
  (16 строк) — порядок и сигнатуры не менялись.

## Остаток

- `WorkspaceExplorer.jsx`: **5106 строк** (было 5204 на baseline аудита;
  −113 строк чистого переноса, +16 импорта).
- Место в плане: **Ш1 из 18** (листья: чистые функции и тупые компоненты).
  Следующий шаг — Ш2 (форматтеры + tree helpers).

## Отклонения от DECOMP.md

1. **База ветки**: PR #903 (Ш0) ещё не вмержен в `main` (state OPEN на момент
   работы). Ветка создана от HEAD #903 (`2b1724c7`); PR открыт с base
   `refactor/workspace-explorer-s0-tests` и **ретаргетируется на `main` после
   мержа #903**. Это прямо допущено DECOMP: «шаги 1–3 можно вести параллельно
   … но мержиться строго после Ш0».
2. **`src/test-utils/explorerSourceText.mjs`** (тест-утилита, не тест): листинг
   файлов сделан рекурсивным, т.к. DECOMP кладёт переносимый код в подпапку
   `components/`, а ридер Ш0 читал только верхний уровень `features/explorer/`
   — без этого source-тесты (например, pin `function IcoSearch(`) потеряли бы
   иконки из конкатенации. **Ожидания тестов не изменены**, файлы `*.test.mjs`
   не тронуты. Это «добавление путей» в смысле ретаргета Ш0, а не изменение
   поведения.

## Подтверждение

- **char-тесты не тронуты**: `git diff` по `frontend/src/features/explorer/char/`
  пуст; `npm run test:char` — 17/17 зелёных.
- Source-тесты: explorer-scoped `node --test` (как в CI gate) — **207/207**.
- `npm run lint` (eslint no-undef gate CI) — 0 ошибок.
- `npm run test:smoke` — 30/30.
- Полный `node --test` (не гейтится CI, ~90 pre-existing фейлов вне контура,
  см. PR #903): фейлов с упоминанием explorer/workspace нет; расхождение
  наборов фейлов между прогонами — flaky-тесты чата/AI, не связанные с контуром.

## Запрещённые действия

Merge — только после явного approve владельца. Никаких правок вне переноса.
