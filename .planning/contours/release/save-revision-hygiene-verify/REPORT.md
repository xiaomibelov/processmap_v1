# RELEASE: save-revision-hygiene-verify — REPORT

**Contour:** `release/save-revision-hygiene-verify`  
**Status:** `PRE-GATE BLOCKED`  
**Source fix contour:** `fix/save-revision-hygiene`  
**Fix branch HEAD:** `be3b5cab1189498131d02f2c1362ffefac9b4666`  
**Expected base:** `origin/main @ 030f086a47e88cab14732246a58f771260844e74`  
**Actual origin/main:** `030f086a47e88cab14732246a58f771260844e74`  
**Worktree:** `/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-worktrees/fix-save-revision-hygiene`  
**PR:** не найден / не создан  
**Merge commit in origin/main:** отсутствует  

---

## 0. Активация

- Skill `processmap-agent` → AGENTS.md.
- RAG preflight (`node tools/rag/pm-rag-agent-preflight.mjs`) — не выполнялся, т.к. pre-gate не пройден.
- Obsidian: исходные артефакты контура `fix/save-revision-hygiene` доступны в `ProcessMap/AgentReports/fix/save-revision-hygiene/`.

---

## 1. PRE-GATE проверки

| Проверка | Ожидание | Факт | Вердикт |
|---|---|---|---|
| PR смержен в `origin/main` | `git merge-base --is-ancestor fix/save-revision-hygiene origin/main` → true | false | ❌ FAIL |
| Merge commit ∈ origin/main | В `git log origin/main` есть merge коммит PR | отсутствует | ❌ FAIL |
| CI на PR и main зелёный | spec-drift, contract, builds passed | PR не существует | ❌ FAIL |
| Stage /version содержит merge commit | n/a | n/a | ⏸️ skipped |
| Stage frontend свежий | n/a | n/a | ⏸️ skipped |
| Prod /version не менялся | `8f904834` (или новее) | n/a | ⏸️ skipped |

### Git-proof pre-gate

```text
origin/main: 030f086a47e88cab14732246a58f771260844e74
fix branch HEAD: be3b5cab1189498131d02f2c1362ffefac9b4666
merge-base(origin/main, fix branch): 030f086a47e88cab14732246a58f771260844e74
is-ancestor(fix branch, origin/main): NO

origin/main log (top):
  030f086a fix(rag): scope search by source_type at SQL level to include dictionary chunks (#886)
  cff021fc fix(session): defensive guard against literal 'None' session_id in PUT /bpmn (#885)
  3d0e6eff fix(agent,llm): idempotent 032 seed, cost_usd propagation, ALEMBIC_HEAD=033 (#883)
  04d3fc48 feat(session-assignees): many-to-many responsible users for sessions (#884)
  ed81667b Merge pull request #882 from xiaomibelov/fix/structured-fact-qa-stage-v1
```

### GitHub PR check

```bash
curl -s "https://api.github.com/repos/xiaomibelov/processmap_v1/pulls?state=all&head=xiaomibelov:fix/save-revision-hygiene"
```

Результат: `[]` — PR не существует.

---

## 2. Разбор

Контур `release/save-revision-hygiene-verify` запущен, но **pre-gate не пройден**: fix-ветка `fix/save-revision-hygiene` не вмержена в `origin/main`, а PR на GitHub не найден. Без merge commit в `origin/main` невозможно:

- деплоить на stage свежий код фикса;
- проверить `/version` на stage/prod;
- запускать протокол аудита §2, т.к. поведение на стейдже ещё не содержит изменений.

---

## 3. Блокирующие действия (требуют approve пользователя)

1. **Создать PR** для `fix/save-revision-hygiene` → `main`.
   - Title: `fix(save): гигиена ревизий — no-op guard, без лишнего meta-PATCH, классификация same_tab`
   - Body: см. `fix/save-revision-hygiene/EXEC_REPORT.md` §6 (ссылки на аудит + repro_06.har, решения по §2, тесты, риски).
2. **Review + approve PR** (approve №1).
3. **Merge PR в `main`**.
4. Дождаться зелёного CI на `main`.
5. После этого — возобновить контур `release/save-revision-hygiene-verify`.

---

## 4. Что будет проверяться после разблокировки

### Stage verify (§2 протокола)

- Тест 1: 1 клик «Сохранить» с правкой → ровно 1 пишущий запрос, +1 dsv, +1 ревизия.
- Тест 2: 3 сохранения без изменений → dsv +0, ревизий +0, `changed_keys=[]`.
- Тест 3: идентичный контент со stale base → 200, dsv не меняется.
- Тест 4: быстрые правки → 0 модалок, 0 × 409.
- Тест 5: две реальные вкладки → `same_user_other_tab` появляется.
- Тест 6: stale tracker → `same_tab` авторазрешается без модалки.
- Фоновые писатели: пауза 5 мин → dsv не двигается.

### Регресс-свип (§3)

- Smoke логин/org/workspace/сессии/поиск/админка «Графы».
- Сохранение в 2–3 реальных стейдж-сессиях без 409.
- Логи api/worker: нет новых error-паттернов.
- Потребители dsv: badge, presence/toast, merge-панель.

### Prod deploy gate (§4)

- DEPLOY_PLAN с `git diff --stat` от prod `/version` до merge commit.
- Проверка redis queue.
- Вердикт GO/NO-GO → approve №2.

### Post-deploy verify (§5)

- `/version` == merge commit.
- Тесты 1, 2, 4 на проде в новой тестовой сессии.
- Orphan re-scan = 0, unregistered = 0.
- Watch-item на +24ч.

---

## 5. Риски и ограничения

- Без approve №1 контур заблокирован.
- Stage verify требует рабочего stage-окружения и доступа к БД/HAR.
- Prod deploy gate требует отдельного approve №2.

---

## 6. Артефакты

- `REPORT.md` — этот файл.
- `STATE.json` — состояние контура.
- Будут добавлены после разблокировки: HAR-файлы, скриншоты, SQL-дампы (без секретов).
