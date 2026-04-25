# ProcessMap — Codex/GSD Operating Contract

## 1. Каноническая истина проекта
- Единственный canonical repo root: `/Users/mac/PycharmProjects/processmap_canonical_main`.
- Единственный canonical remote: `git@github.com:xiaomibelov/processmap_v1.git`.
- Baseline для любой новой работы: актуальный `origin/main`.
- Любое расхождение runtime/source truth сначала доказывается, потом исправляется.

## 2. Ветвление и изоляция контуров
- Новая фича = новая отдельная ветка от `origin/main`.
- Новый баг = новая отдельная ветка от `origin/main`.
- Запрещено смешивать разные contours в одной ветке/PR.
- Если в дереве есть чужие/unrelated изменения, не относящиеся к контуру: `BLOCKED` до безопасной изоляции (например, через clean worktree).

## 3. Runtime/source truth перед validation
- До любых выводов обязательно зафиксировать:
  - `pwd`
  - `git remote -v`
  - `git fetch origin`
  - `git branch --show-current`
  - `git rev-parse HEAD`
  - `git rev-parse origin/main`
  - `git status -sb`
  - `git diff --name-only`
  - `git diff --cached --name-only`
- Правило: если `intended != served`, статус работы = `BLOCKED` до устранения расхождения.

## 4. Доказательная модель (5 плоскостей)
- Перед финальным вердиктом нужно доказать 5 planes:
  - `code` (какой commit/ветка реально содержит fix),
  - `workspace` (какой checkout/worktree реально используется),
  - `DB` (что в durable данных после сценария),
  - `env/compose` (какой environment/compose stack активен),
  - `serving mode` (что реально отдается runtime, а не только локально ожидается).

## 5. Obsidian-first workflow
- Сначала читаются релевантные заметки в `PROCESSMAP` (минимум: `EPIC BOARD`, `ACTIVE TASKS`, релевантные контракты).
- Потом выполняется bounded implementation.
- По итогам обязательно фиксируется короткий handoff в Obsidian: что сделано, что доказано, что осталось.

## 6. Ограничения на изменения
- Без broad refactor без явного доказательства необходимости.
- Без product-code изменений вне заявленного bounded contour.
- Любые решения по runtime/save/revision/status/template контурам не смешиваются между собой без прямого evidence.

## 7. Review, merge, release gate
- Review обязателен для каждого bounded контура.
- Merge в `main` только после явного подтверждения пользователя.
- Release flow:
  - `branch -> push -> PR -> user approval -> merge -> auto deploy to stage -> verify -> manual prod deploy (from main only)`.

## 8. Обязательный финальный proof в каждом серьезном контуре
- Короткий git-proof (`branch`, `HEAD`, `status`, `diffstat`).
- Короткий handoff-proof (что именно было целью, что закрыто, какие риски/ограничения остались).
