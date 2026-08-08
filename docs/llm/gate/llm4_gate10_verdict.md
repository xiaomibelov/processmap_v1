# Гейт ⑩ — «дельта пуста по именам»: ИТОГ (06.08)

**Статус: ✅ ПРОЙДЕН** — после починки регрессии дельта падений между веткой `feat/llm4-processman-panel` и origin/main **пуста** (в same-mode прогоне).

## Как проводилось сравнение (честный same-mode)

Ранее baseline (`/tmp/ftest_full.log`) и current были запущены РАЗНЫМИ способами → TAP-форматы
несопоставимы (86 файловых обёрток vs 21 верхнеуровневый сабтест). Вывод из ошибок-уроков:
**сравнивать можно только прогоны одной командой**.

| Прогон | Команда | tests | pass | fail | skip |
|---|---|---|---|---|---|
| baseline origin/main (worktree `/tmp/llm4_base_wt`) | `find src -name "*.test.mjs" -print0 \| xargs -0 node --test` | 2836 | 2770 | **62** | 4 |
| ветка LLM4 (до фикса) | та же | 2849 | 2782 | **63** | 4 |
| ветка LLM4 (после фикса) | та же | 2849 | 2783 | **62** | 4 |

Замечание: `node --test "src/**/*.test.mjs"` из package.json НЕ работает на Node v20.19 (glob
не раскрывается — «Could not find …src/**/*.test.mjs»). Проект, видимо, рассчитан на Node ≥21.
Поэтому same-mode прогон — через `find | xargs` (502 файла, оба раза одинаково).

## Дельта по именам (location-стиль, нормализованные пути)

- **до фикса**: ровно **1 новое имя** — `apiRoutes: generated sample URLs do not have trailing slash variants` (lib/apiRoutes.test.mjs). Все остальные 62 — pre-existing (совпадают с baseline).
- **после фикса**: новые = ∅, пропавшие = ∅ → **дельта пуста**.

## Корневая причина регрессии

В `frontend/src/lib/apiRoutes.js` группа `llm` уже существовала (origin/main :240):

```js
llm: {
  sessionTitleQuestions: () => "/api/llm/session-title/questions",
  settings: () => "/api/settings/llm",
  verify: () => "/api/settings/llm/verify",
},
```

LLM4 добавил **вторую** группу `llm` с `status()` в конец объекта → дублирующий ключ объекта
перезаписал исходную группу → `apiRoutes.llm.settings` стал `undefined` → тест
«generated sample URLs do not have trailing slash variants» (был `ok 2303` в baseline) упал:
`TypeError: apiRoutes.llm.settings is not a function`.

## Фикс (минимальный)

`status()` добавлен **в существующую** группу `llm`, дубликат удалён. Итоговый diff — +2 строки:

```diff
   llm: {
     sessionTitleQuestions: () => "/api/llm/session-title/questions",
     settings: () => "/api/settings/llm",
     verify: () => "/api/settings/llm/verify",
+    // LLM4 — статус LLM-гейтвея (configured + дневная квота токенов). Вне sessions.
+    status: () => "/api/llm/status",
   },
```

## Верификация

- `node --test src/lib/apiRoutes.test.mjs` → 6/6 pass
- Панельные тесты (зависят от `apiRoutes.llm.status`): ProcessmanPanel 8/8 + tokenEconomy 5/5 + schemaAssistantBlock.source 6/6 = **19/19**
- Полный same-mode прогон ветки: **2849 / 2783 / 62 / 4** (EXIT=123 ожидаем при 62 фейлах)
- Дельта по именам vs baseline: **пуста** (comm -23/-13 не дали ни строки)

## Решение по гейту

Гейт ⑩ «дельта пуста по именам» — **ПРОЙДЕН**. Остающиеся 62 фейла — pre-existing (одинаковы
на origin/main и на ветке), не относятся к контуру LLM4. Регрессия apiRoutes — устранена
сопровождающим коммитом (см. PR-отчёт).
