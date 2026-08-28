# PLAN — fix/purge-clearvestnic-domain

**Contour type:** fix  
**Contour id:** fix/purge-clearvestnic-domain  
**Branch:** `fix/purge-clearvestnic-domain`  
**Baseline:** `origin/main` @ `ffaaa38f45e78a215471b980c8f98b1c333a412d`  
**Created:** 2026-08-28  
**Owner approval required before:** merge / PR merge / deploy

---

## 1. Goal

Полностью удалить/заменить все упоминания выведенного домена `clearvestnic.ru` в репозитории ProcessMap, RAG-facts, документации и Obsidian-истории. Зафиксировать правило доменов/окружений в `AGENTS.md`.

## 2. Domain/environment rule (source of truth)

- `clearvestnic.ru` — не существует в проекте. Домен выведен навсегда.
- `processmap.ru` = PROD (сервер `45.87.104.69`).
- `stage.processmap.ru` = STAGE.
- Других доменов/окружений нет.
- Локальная разработка: `localhost:5177` (frontend), `localhost:8011` (api).

## 3. Scope

### 3.1 Active configs/docs/code (replace/remove)
- `tools/rag/facts/processmap-runtime-facts.json`
- `tools/rag/facts/processmap-agent-rules.json`
- `tools/rag/facts/processmap-validation-facts.json`
- `tools/rag/processmap-rag-validation-queries.json`
- `docs/agent/AGENT_SVC_PLAN.md`
- `docs/agent/AGENT_SVC_PHASE5_VERIFICATION.md`
- `AGENTS.md` — добавить блок "Домены и окружения"

### 3.2 Historical artifacts (DEPRECATED banner only)
- Все `.planning/contours/**/*` файлы с упоминаниями `clearvestnic.ru`.
- Все Obsidian-заметки в `/srv/obsidian/project-atlas/ProcessMap` с упоминаниями `clearvestnic.ru`.

### 3.3 Out of scope
- Сервер `45.87.104.69` — не ходить, не менять nginx-конфиги.
- Переписывание содержимого исторических отчетов (только баннер).

## 4. Acceptance criteria

- [ ] `grep -ri "clearvestnic" .` по рабочему дереву находит только:
  - DEPRECATED-баннеры в исторических `.planning` документах;
  - правило-запрет в `AGENTS.md`.
- [ ] Активные конфиги/документы используют только `processmap.ru`, `stage.processmap.ru`, `localhost`.
- [ ] CI/workflows не содержат `clearvestnic.ru`.
- [ ] `AGENTS.md` содержит явный блок "Домены и окружения".
- [ ] Obsidian-исторические заметки содержат DEPRECATED-баннер.
- [ ] Артефакты контура созданы и замиррорены.
- [ ] Тесты, затронутые изменениями активных конфигов, проходят (если есть).

## 5. Plan

1. RAG preflight (`tools/rag/pm-rag-agent-preflight.mjs`).
2. Полный `grep -ri "clearvestnic" .` по репозиторию.
3. Классифицировать вхождения: active → заменить; historical → DEPRECATED.
4. Обновить активные RAG-facts и документы.
5. Добавить блок в `AGENTS.md`.
6. Пометить DEPRECATED все исторические `.planning` артефакты.
7. Пометить DEPRECATED все исторические Obsidian-заметки.
8. Создать артефакты контура + mirror в Obsidian.
9. Повторный grep + прогнать затронутые тесты.
10. Подготовить PR-описание (на русском) с чек-листом.

## 6. Risks

- `tools/rag` факты используются preflight-скриптами; замена должна быть согласована с актуальным локальным стеком (`localhost:5177/8011`) и stage (`stage.processmap.ru`).
- Исторические `.planning` и Obsidian файлы многочисленны; автоматическая вставка баннера не должна затронуть frontmatter.
