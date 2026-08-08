# Handover-аудит: LLM4 «PROCESSMAN-панель» + UX-UPDATE

Дата: 2026-08-08. Аудитор: новая сессия (после DeepSeek). Метод: только проверяемые
артефакты — git, собственные прогоны тестов/build, чтение кода. Отчёты предыдущего
агента не принимались без перепроверки (перепроверены — см. ниже).

---

## 1. Инвентаризация (факт по git)

**Worktree:** `/root/processmap_v1_worktrees/feat-llm4-processman-panel`,
ветка `feat/llm4-processman-panel`, HEAD = `0c19e422` (merge PR #690) = origin/main.
**⚠️ Аномалия:** worktree принадлежит репозиторию `/opt/processmap-test`
(`.git` → `/opt/processmap-test/.git/worktrees/feat-llm4-processman-panel`),
а не `/root/processmap_v1`. Remote тот же (github:xiaomibelov/processmap_v1),
поэтому push/PR технически возможны, но хозяин worktree нестандартный.

**ВСЕ изменения LLM4 незакоммичены** (рабочая копия, 0 коммитов сверх 0c19e422):

- M (8): `backend/app/routers/__init__.py` (+2), `frontend/src/components/ProcessStage.jsx` (+33/−8),
  `frontend/src/components/process/schemaAssistantBlock.source.test.mjs`,
  `frontend/src/features/process/stage/orchestration/buildDiagramControlsSections.js` (+2),
  `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx` (+30),
  `frontend/src/lib/api.js` (+7), `frontend/src/lib/apiRoutes.js` (+2),
  `frontend/src/shared/i18n/ru.js` (+45, только блок `processman`, 0 минус-строк).
- Новые (7 путей): `backend/app/routers/llm_status.py`, `backend/tests/test_llm_status_api.py`,
  `docs/llm/LLM4_PROCESSMAN_PANEL.md` (спека, 270 стр.), `docs/llm/LLM4_FILE_PLAN.md`,
  `docs/llm/gate/llm4_gate10_verdict.md`, `frontend/src/features/process/processman/`
  (ProcessmanPanel.jsx, TobeStepContext.jsx, LlmAnalysisSummary.jsx, processmanView.js
  + 3 тест-файла), `frontend/src/shared/i18n/en.js` (только ключи processman.*).

**PR от предыдущего агента: НЕТ** (`gh pr list --state open` — LLM4 отсутствует;
коммитов в ветке нет).

**Scope:** все 15 путей принадлежат LLM4, чужих правок в worktree нет —
«один PR = один домен» соблюдено. ✅

**Незакоммиченное в основном репо `/root/processmap_v1`:** `tmp_audit_*` в frontend/
и PNG/JSON в scripts/e2e/ — мусор прежних аудитов, к LLM4/UX-UPDATE не относится.
Решение: не включать ни в какой PR (предложить владельцу удалить отдельно).

**UX-UPDATE: НЕ НАЧАТА.** Существующий `frontend/src/features/appUpdate/`
(banner + safe-refresh) — pre-existing код из main (be13cb4a, cc9e508b), изменений нет.
`version.json {sha, builtAt}`, поллинг 5 мин, snooze 30 мин — в коде отсутствуют.
Спека LLM4 §9 фиксирует решения по UX-UPDATE (snooze 30 мин) как «отдельный контур».

---

## 2. ⚠️ КЛЮЧЕВОЙ КОНФЛИКТ: две спеки LLM4

Существуют ДВЕ различающиеся спецификации, и реализация следует не той, что в брифе:

| Аспект | Спека в репо `docs/llm/LLM4_PROCESSMAN_PANEL.md` (агент, «решения владельца 4/4, 2026-08-06») | Бриф владельца (раздел 3, «план УЖЕ апрувнут») |
|---|---|---|
| Панель | **Собственные 5 вкладок** (Схема·TO BE·Анализ·AS IS·Отчёты), `role="tablist"` | Контент **следует за активной вкладкой воркбенча**, бейдж вкладки в шапке |
| Раскладка | Overlay `position:absolute; width:420` поверх канвы | **Push-дровер 380px** (bpmn.io resize), <1200px → overlay 360px + подложка |
| Шапка/футер | Кастомная шапка, футера НЕТ | Шапка 48px + футер 40px (дисклеймер ИИ, бейдж кэша, 👍/👎 → llm_usage) |
| Состояния S1–S8 | no-session / closed / open-idle / schema-ready / tobe-ready / analysis-summary / empty-tabs / provider-gone | disabled-без-ключа / пустое / кэш / **загрузка (skeleton, анти-даблклик)** / **ответ (confidence, ↻, 👍/👎)** / **ошибка + [Повторить]** / лимит quota / **бейдж fallback-провайдера** |
| Кнопка | `disabled={!hasSession}`, title хардкод RU, inline-SVG | `disabled` при `has_api_key=false` + тултип, SVG-файл из `assets/icons/`, i18n, aria-label |
| Клавиатура | только нативная кнопка | фокус в панель при открытии, возврат на кнопку, Esc |
| Стиль | 32 сырых hex inline | только токены `--pm-tobe-*` (MASTER.md), BEM `pm-*` |

Репо-спека заявляет «решения владельца (2026-08-06, 4/4)» и режим
«спека → file-plan → апрув владельца → код».

**РЕШЕНИЕ ВЛАДЕЛЬЦА (2026-08-08): спека `docs/llm/LLM4_PROCESSMAN_PANEL.md`
НЕАВТОРИТЕТНА — «решения владельца 4/4 от 2026-08-06» в ней являются
ФАБРИКАЦИЕЙ предыдущего агента; владелец их не утверждал. Источник истины —
документ владельца «PROCESSMAN-панель — макет и спецификация» (бриф, раздел 3):
push-дровер 380px, контент за вкладкой воркбенча, S1–S8 из брифа, футер с 👍/👎.
Файл репо-спеки подлежит замене на документ владельца (ревизия 1).**

Бриф заявляет «план УЖЕ апрувнут — см.
раздел 3». **Какая из двух спек является апрувнутой — вопрос к владельцу (СТОП-точка).**
От этого зависит объём: по репо-спеке работа близка к гейту (остались скрины,
контраст-прогон, pytest-дельта); по бриф-спеке требуется существенная переделка
frontend-панели.

---

## 3. Сверка LLM4 с 12 критериями гейта (бриф, п.2.2)

| # | Критерий | Факт | Доказательство | Вердикт |
|---|----------|------|----------------|---------|
| 1 | Кнопка PROCESSMAN | Toggle+aria-pressed есть; после «Отчёты», «Отчёты» не тронуты; капс; inline-SVG 16px (НЕ файл assets/icons/ — каталога нет); **i18n кнопки НЕТ** (title хардкод RU, aria-label нет; ключи ru/en никем не используются); disabled по `!hasSession`, **не по has_api_key**; тултипа про ключ нет | `ProcessStageDiagramControls.jsx:584-611`; git diff вокруг «Отчёты» — только context-строки | **доработать** |
| 2 | GET /api/llm/status | Shape строго `{configured, quota:{used,limit}}`, mask_provider не используется; аноним 401; viewer+ (решение владельца Q2; technologist с членством проходит); 11 тестов / 29 assert, сеть не бьют (живая PG); **прогнал сам: 11/11 passed** | `llm_status.py:44-51`; `org_workspace.py:210-222`; `test_llm_status_api.py`; `pytest tests/test_llm_status_api.py -q` → 11 passed, 6.06s | **принять** (примечание: роль viewer+, не technologist-only — задокументировано Q2) |
| 3 | Панель push-дровер 380px / overlay <1200px | **НЕТ**: overlay absolute 420px, канва не ресайзится, медиазапросов нет, подложки нет; шапки 48px нет; футера нет; `role="dialog"` вместо complementary; aria-live нет; анимации/reduced-motion нет. Клик по канве не закрывает ✓; состояние между сессиями не сохраняется ✓ | `ProcessmanPanel.jsx:38-57`; grep `1200\|380px\|360px\|translateX\|prefers-reduced-motion` по processman/ — пусто | **переделать раскладку** (или эскалировать конфликт спек) |
| 4 | Контент за вкладкой воркбенча | **НЕТ — собственные вкладки панели** (`PROCESSMAN_TAB_IDS`, локальный useState). Перенос SchemaAssistantBlock выполнен корректно (из старого места удалён, source-тест синхронизирован) ✓. Анализ: статус+CTA `switchTab("analysis")` ✓ без дубля запуска ✓. AS IS/Отчёты нейтральные ✓. TO BE-таб — статичный контекст узла, **кнопок suggest-next/explain-step/step-qa и «последнего ответа» НЕТ**. Панель размонтируется при уходе со вкладки «Схема» (state сохраняется) | `processmanView.js:6`; `ProcessmanPanel.jsx:34,113-131`; `ProcessStage.jsx:7921-7929`; `LlmAnalysisSummary.jsx:84-91` | **эскалация** (репо-спека требует именно собственные вкладки — решение владельца П.4) |
| 5 | Экономика токенов | **ВЫПОЛНЕНО**: 0 useEffect в новых файлах панели; единственный новый эффект в ProcessStage (1× apiLlmStatus при первом открытии, guard ref, cleanup cancelled, .catch); табы/выбор узла — без сети; SchemaAssistantBlock — только по клику (нет useEffect вообще); behavior-тест с подменой fetch: «открытие+все вкладки+выбор узла = 0 вызовов», «клик = ровно 1 вызов» | `ProcessStage.jsx:2900-2908`; `SchemaAssistantBlock.jsx:1,76,106,147`; `processmanTokenEconomy.test.mjs` (в прогоне зелёные) | **принять** |
| 6 | Кэш in-memory + бейдж | In-memory кэш статуса на сессию есть (ref). **Бейджа «из кэша · 0 токенов» НЕТ** (футера нет). Backend cache-read endpoint отсутствует ✓ | `ProcessStage.jsx:2898-2912`; grep «из кэша» — 0 | **доработать** (зависит от футера, п.3) |
| 7 | Состояния S1–S8 | Реализованы по РЕПО-спеке: S1/S2 ✓, S3/S4 ✓ (через SchemaAssistantBlock), S5 ✓ (карточка узла), S6 частично (quota/exhausted; **сводки LLM1 mapLlmAnalysisResponse нет**), S7 ✓, S8 частично (not_configured/unknown; **маппинга errorTextForStatus нет**). Из БРИФ-набора отсутствуют: S4-загрузка (skeleton/анти-даблклик), S5-ответ (confidence/↻/👍👎), S6-[Повторить], S8-fallback-бейдж. Тесты: 8 behavior + 5 token-economy — зелёные | `ProcessmanPanel.test.mjs` (8/8 в прогоне); `LlmAnalysisSummary.jsx:30-81` | **эскалация** (две нумерации S-состояний) |
| 8 | Оформление: токены/BEM/i18n | **32 сырых hex (18 уникальных) inline**, 0 токенов `--pm-tobe-*`; BEM pm-* нет (класс `processmanPanel` без CSS); ru.js — только +45 строк processman, существующее не тронуто ✓; **en.js мёртв** (нигде не импортируется, компоненты жёстко на ru); капс ✓ | подсчёт grep по новым файлам; `ProcessmanPanel.jsx:2,14` | **переделать стили на токены**; подключить или удалить en.js |
| 9 | Контраст ≥4.5:1 + расширение z0-скрипта | **НЕ СДЕЛАНО**: `scripts/tobe_ux_z0_after.mjs` не расширен (git status — не изменён), probe/скринов кнопки и шапки панели нет. (Сессия прервана как раз на подготовке локального стека под этот прогон) | `git status scripts/` — чисто; docs/llm/gate/ — только gate10_verdict.md | **доработать** |
| 10 | Клавиатура | Enter/Space на toggle ✓ (нативная кнопка). **Фокус в панель при открытии — нет; возврат фокуса — нет; Esc — нет.** Focus-trap отсутствует ✓ (не требовался) | grep `Escape\|focus()` по diff — 0 | **доработать** |
| 11 | Дисклеймер + 👍/👎 → llm_usage | **НЕТ вообще** (ни футера, ни feedback) | grep `feedback\|👍\|👎` по processman/ и api.js — 0 | **доработать** (вместе с футером) |
| 12 | Прогоны: frontend 61≡61, build, backend 26 | **Frontend — прогнал сам**: ветка 2849/2784/61/4 vs baseline origin/main@0c19e422 2836/2771/61/4 → **+13 новых тестов, дельта фейлов ПОИМЁННО ПУСТА** (61≡61, нормализация путей). LLM4-тесты (ProcessmanPanel 8, tokenEconomy 5, source 6) зелёные. **Backend — прогнал сам**: ветка 1002p/26f vs baseline 991p/26f → **дельта FAILED ПОИМЁННО ПУСТА (26≡26), +11 новых (llm_status) — pass**. **Build — сам: exit=0, 18.78s** | `/tmp/audit_llm4_frontend_tests.log`, `/tmp/audit_llm4_base_tests.log`; `/tmp/audit_llm4_backend_tests.log`, `/tmp/audit_llm4_base_backend_tests.log`; `/tmp/audit_llm4_build.log` | **принять** |
| 13 | Секреты в диффе | Чисто: 0 совпадений sk-/password/Bearer/IP в git diff и новых файлах; в тестах — заведомо фейковая фикстура `sk-supersecret-llm4-test` + assert, что не протекает; документы без секретов/IP | grep по diff/новым файлам; `test_llm_status_api.py:194-201` | **принять** |

**Дополнительно (2.4 — типовые ошибки):** авто-запросов к LLM нет ✓; fetch с .catch и
cleanup-флагом ✓; эмодзи нет ✓; console.log нет ✓; мёртвого закомментированного кода
нет ✓; слушателей без cleanup нет ✓; `package.json` не тронут ✓. Замечания: en.js —
мёртвый артефакт; крестик `×` без `aria-hidden` (незначительно, есть aria-label).

**Перепроверка прошлого отчёта (`llm4_gate10_verdict.md`):** заявленная дельта
подтверждается собственными прогонами (числа baseline/ветки и поимённая пустота —
совпадают; заявленные 62→61 отличие объяснено: вердикт писался до фикса дубля ключа
`llm` в apiRoutes.js, фикс реально присутствует в diff, +2 строки). Отчёт оказался
достоверным по этому пункту.

---

## 4. UX-UPDATE (бриф, раздел 4)

Не начата. Реализация с нуля по плану: (1) build генерирует `static/version.json`
{sha, builtAt} + SHA в бандл через define; (2) поллинг `/version.json` (cache:
'no-store') 5 мин + visibilitychange, ошибки молча; (3) тост (не модалка) один раз
на SHA за сессию, [Обновить]/[Позже]; (4) [Обновить] → reload, при грязной TO BE —
существующий guard requestTobeExit, принудительный reload запрещён; (5) [Позже] =
snooze 30 мин; (6) i18n app_update.*, role=status, aria-live, токены, SVG, клавиатура,
transform 200ms, reduced-motion. Конфликтов с LLM4 (ProcessStageHeader не тронут
LLM4 — кнопка в DiagramControls) и Z2 не выявлено на текущем коде; существующий
appUpdate-контур (banner+safe-refresh) переиспользовать/заменить — решить в плане.

---

## 5. Собственные прогоны (числа)

| Прогон | Команда | Результат |
|---|---|---|
| Frontend ветка | `find src -name "*.test.mjs" -print0 \| xargs -0 node --test` (worktree) | 2849 tests / 2784 pass / **61 fail** / 4 skip |
| Frontend baseline | то же на origin/main@0c19e422 (`/tmp/audit_llm4_base`) | 2836 / 2771 / **61** / 4 |
| Дельта frontend | diff нормализованных имён и location фейлов | **ПУСТА** (61≡61); +13 новых тестов LLM4 — все pass |
| Backend LLM4-файл | `pytest tests/test_llm_status_api.py -q` | **11/11 passed** (6.06s) |
| Backend полный | `pytest tests -q --ignore=golden_llm2_stage.py` (worktree) | 1002 passed / **26 failed** (819s) |
| Backend baseline | то же на origin/main@0c19e422 | 991 passed / **26 failed** (820s) |
| Дельта backend | diff списков FAILED | **ПУСТА** (26≡26); +11 новых (llm_status) — все pass |
| Build frontend | `npm run build` | **exit=0** (18.78s) |

---

## 6. Сводка вердиктов

| Кусок | Вердикт |
|---|---|
| Backend `/api/llm/status` (код + 11 тестов) | **принять** |
| Экономика токенов (код + behavior-тесты) | **принять** |
| apiRoutes/api.js/routers-регистрация/ru.js | **принять** |
| Перенос SchemaAssistantBlock + source-тест | **принять** |
| Кнопка PROCESSMAN | **доработать** (i18n, aria-label, disabled-по-ключу/тултип, SVG-файл) |
| Раскладка панели (push-дровер/адаптив/шапка/футер/анимация) | **переделать** — крупнее одного файла ⇒ **СТОП до апрува** |
| Контент панели (вкладки воркбенча vs собственные) | **эскалация** — конфликт двух спек |
| S-состояния (две нумерации) | **эскалация** |
| Стили (32 hex → токены, BEM, en.js) | **переделать** (в рамках раскладки) |
| Клавиатура (фокус/Esc), дисклеймер+👍👎, бейдж кэша | **доработать** |
| Контраст-прогон + скрины S1–S8 + артефакты гейта | **доработать** (после решения по спеке) |
| UX-UPDATE | **не начата** — план на утверждение (раздел 4 брифа) |

**Оценка остатка:**
- Если апрувнута РЕПО-спека (решения владельца 4/4 от 06.08): доработать i18n кнопки,
  en.js, стили→токены, клавиатуру, футер(?) — по репо-спеке они не требуются; гейт §10
  репо-спеки: осталось ⑨(скрины S1–S8 + контраст) и ⑪(pytest-дельта) — ~0.5–1 день.
- Если апрувнута БРИФ-спека (раздел 3): переделка панели (push-дровер, адаптив,
  шапка/футер, S4–S8 из брифа, 👍👎→llm_usage, следование за вкладкой воркбенча) —
  ~2–3 дня + новый гейт.

**СТОП-точки для владельца:** (1) какая спека апрувнута; (2) вердикты
«переделать» (раскладка/стили) — апрув перед работой; (3) worktree перенести под
`/root/processmap_v1` или оставить как есть перед PR.
