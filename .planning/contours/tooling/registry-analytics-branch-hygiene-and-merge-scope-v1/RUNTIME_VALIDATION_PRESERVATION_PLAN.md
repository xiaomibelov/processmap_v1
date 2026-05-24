# RUNTIME_VALIDATION_PRESERVATION_PLAN

Контур: `tooling/registry-analytics-branch-hygiene-and-merge-scope-v1`  
Run ID: `20260517T191023Z-10717`

## Цель

После сборки clean branch от `origin/main` нужно доказать, что изоляция не потеряла уже review-passed runtime behavior для Analytics Hub и Product Actions Registry.

## Runtime facts, которые нельзя потерять

| Область | Обязательный preserved behavior |
|---|---|
| Analytics entry | В workspace/project navigation есть вход в Analytics, а не прямой top-level registry-only entry. |
| Analytics Hub | `?surface=analytics` рендерит страницу `Аналитика` с summary cards без fake numbers. |
| Nested registry | Карточка `Реестр действий` внутри Analytics открывает registry с `return_to=analytics`. |
| Placeholders | `Реестр свойств`, `Дашборды`, `Экспорт` остаются placeholders со статусами, без fake product behavior. |
| Registry populated scope | В real populated project scope таблица показывает строки, pagination, status/incomplete warnings. |
| Registry empty workspace scope | Empty scope не превращается в blank/broken page: видны metrics, filters/actions, AI controls, table headers, empty message, pagination shell, sources block. |
| AI controls order | `AI: предложить действия` и selection counter находятся до table rows/pagination. |
| Sources order | `Источники данных` расположен после table/pagination flow и не конкурирует с primary table. |
| Navigation | `Вернуться` из registry возвращает в Analytics при `return_to=analytics`; close/back не создаёт user trap. |
| Version proof | Visible footer version/changelog and `build-info.json` должны быть coherent with the accepted release story for the clean branch. |
| Network safety | На real Analytics -> Registry and populated registry paths не должно быть unexpected `PUT`, `PATCH`, `DELETE`; registry query endpoint без 4xx/5xx. |
| Console safety | No registry/analytics JS `ReferenceError`, `TypeError`, React key warnings or runtime crashes. |

## Fresh validation sequence after isolation

1. Собрать clean branch/worktree от fresh `origin/main`.
2. Применить только merge-scope manifest A/B/C files.
3. Выполнить build/version generation так, как принято для repo, без ручного включения stale generated evidence.
4. Запустить focused tests из `TESTS_TO_RERUN_AFTER_ISOLATION.md`.
5. Запустить runtime на clean branch и зафиксировать:
   - `pwd`
   - sanitized `git remote -v`
   - branch
   - `HEAD`
   - `origin/main`
   - `git status -sb`
   - `git diff --name-only`
   - active runtime URL/port
   - `curl -I` on frontend
   - `curl -s /build-info.json`
   - backend health
6. Fresh browser context:
   - open `/app?surface=analytics`;
   - verify Analytics Hub content;
   - click `Реестр действий`;
   - verify registry URL and populated/empty scope layout;
   - inspect console and network.
7. Compare DOM order for AI controls, table, pagination, sources:
   - AI controls before table;
   - pagination before sources.
8. Record screenshots as evidence-only artifacts, not product merge files.

## Release blocker

Current served runtime is dirty (`build-info.json dirty=true`) and branch is `fix/lockfile-sync-test`. That is acceptable as historical review evidence, but not acceptable as final release proof after clean isolation. Final release proof must come from the clean branch intended for PR.

