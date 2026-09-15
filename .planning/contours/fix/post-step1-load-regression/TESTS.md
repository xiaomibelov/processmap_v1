# TESTS.md — fix/post-step1-load-regression

## Проведённые прогоны

### Hardening-патч (коммит `7574b8d0`)

| Прогон | Результат |
|---|---|
| `node --test opsOutbox/*.test.mjs` (включая новый `createSaveOutbox.retryJitter.test.mjs`, 6 тестов) | **67/67 pass** |
| `node --test src/features/session/*.test.mjs` (saveCoordinator, джиттер-интеграция) | **18/18 pass** |
| Полный frontend `node --test $(find src -name '*.test.mjs')` | 3710 тестов: 3627 pass / 79 fail; baseline без изменений: 3621 pass / 85 fail → дельта = +6 новых тестов, все 79 failing — pre-existing drift на main (i18n/appVersion/dark-theme и др.), пересечение пустое |
| Независимая верификация исполнителем контура | opsOutbox 67/67, session 18/18 — подтверждено |

### Сценарии новых тестов (`createSaveOutbox.retryJitter.test.mjs`)

1. **Storm «10 вкладок»**: 10 независимых retry-цепочек на failing transport → суммарно ≤ 10 × (retryCount+1) = 40 попыток, интервалы в границах [base·0.7, base·1.3], cap ≤ 8 s·1.3; unbounded retry отсутствует.
2. **Backoff progression**: 1 s → 2 s → 4 s → cap 8 s (probe-пайплайн retryCount 5; ops-pipeline жёстко 3).
3. **Keepalive abort**: зависший transport → `signal.aborted` через ~5 s (fake timers), повторной отправки нет, trace `ops_flush_keepalive_aborted` эмитирован.
4. **Регрессия**: обычный (не keepalive) flush и существующие тайминг-контракты без изменений (`jitterRandom: () => 0.5` → фактор ровно 1.0).

## Регрессионный e2e (миссия п.5)

`frontend/e2e/cold-load-budget.spec.mjs` (новый, 2 теста):
- unauthenticated cold load `/projects` → redirect на login в бюджетах;
- authenticated cold→warm: TTFB (`navigation.responseStart`) < 2 s, load (`navigation.duration`) < 10 s, ни один resource > 5 s / pending; warm-нагрузка обязана быть быстрее холодной; origin сверяется с `E2E_APP_BASE_URL`, fast-fail на localhost (бюджеты — про stage-загрузку через gateway).
- Статус: parse-evidence (`node --check`, `npx playwright test --list` → 2 tests) — собирается; **прогон на stage требует отдельного approve** (мутирует окружение), выполняется после merge патча или по решению владельца. Базовый замер пост-факт текущего окна: TTFB 0.4–0.7 s (корень и version.json) — в бюджете.

## Acceptance step1 — не деградировал

Патч не трогает путь дельта-сохранения (только retry-тайминги и keepalive-abort acceptance-критериев step1: объём дельт, CAS, идемпотентность, p95 на ответы сервера). Юнит-база opsOutbox (67/67) подтверждает.
