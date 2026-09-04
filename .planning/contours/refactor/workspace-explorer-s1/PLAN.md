# PLAN: refactor/workspace-explorer-s1

Шаг Ш1 из `.planning/contours/audit/workspace-explorer-decomposition/DECOMP.md`
(18 шагов + Ш0 + опциональный Ш15′). Этот файл — краткий; полный план — в DECOMP.md.

## Что переносим

- 13 SVG-иконок (`IcoFolder`, `IcoProject`, `IcoSession`, `IcoChevron`,
  `IcoTreeBulk`, `IcoArrowLeft`, `IcoSpinner`, `IcoWorkspace`, `IcoPlus`,
  `IcoSearch`, `IcoTrash`, `IcoEdit`, `IcoMove`) — DECOMP: строки 178–292
  `WorkspaceExplorer.jsx` → `components/explorerIcons.jsx`.

## База

- Ветка `refactor/workspace-explorer-s1` от `2b1724c7` (= HEAD ветки
  `refactor/workspace-explorer-s0-tests`, PR #903). DECOMP допускает параллельный
  ход Ш1–Ш3 до мержа Ш0 («но мержиться строго после Ш0»); после мержа #903
  PR ретаргетируется на `main`.

## Фактический объём

- `WorkspaceExplorer.jsx`: −113 строк (5204 → 5106), +16 строк импорта.
- Новый файл `components/explorerIcons.jsx`: 117 строк (перенос verbatim,
  верифицирован `diff` против `git show HEAD`).
- `src/test-utils/explorerSourceText.mjs`: ридер сделан рекурсивным (+14/−6),
  чтобы подхватывать подпапку `components/` (иначе source-тесты теряли бы
  иконки из конкатенации). Ожидания тестов не менялись.
- Diff PR: ~250 строк (лимит ~400 из DECOMP).

## Критерии приёмки (DECOMP + правила шага)

- [x] Только перенос, ничего не улучшено (verbatim-проверка пройдена).
- [x] char-тесты не тронуты (`git diff` по `char/` пуст).
- [x] Source-тесты зелёные (explorer-scoped node --test: 207/207).
- [x] `npm run lint` — 0.
- [x] `npm run test:char` — 17/17.
- [x] `npm run test:smoke` — 30/30.
