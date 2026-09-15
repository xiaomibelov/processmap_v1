# PATCH.md — fix/post-step1-load-regression

> Дата: 2026-09-15. Коммит: `7574b8d0`. Ветка: `fix/post-step1-load-regression` от `origin/main @ aeca4fcb`.

## Root cause (по FIX_REPORT.md)

Системная деградация загрузки stage после merge step1 (#982) — транзитное окно деплоя (H4 CONFIRMED): полный rebuild образов 11:37:50–11:41:5x + холодный старт api (process start 11:42:02Z) на малом хосте; восстановление без единого изменения (тот же код обслуживается с TTFB 0.4–0.7 s). H1/H2/H5 опровергнуты на кодовом уровне, H3 — не первопричина. Митигация (revert merge) не потребовалась.

## Патч (hardening класса H3/H5, миссия п.4)

Из step1-кода закрыты два реальных gap'а, которые могли усиливать подобные эпизоды:

1. **Retry без джиттера, кап 4 s** → exp backoff 1 s→8 s (`maxRetryDelayMs: 8000`) + джиттер ±30% (`retryJitterRatio: 0.3`, `retryJitterRandom` — инъекция для тестов). Джиттер реализован в `saveCoordinator.js:registerPipeline` (opt-in, default 0 — поведение пайплайнов xml/rawXml/meta не изменено), т.к. backoff-sleep физически там.
2. **Keepalive-flush без abort-таймаута** → AbortController с таймаутом 5 s (`keepaliveAbortMs: 5000`) в `flushNow({keepalive:true})`; при abort — trace `ops_flush_keepalive_aborted`, без retry (best-effort семантика ухода со страницы). Заодно починен проброс `signal` в keepalive-ветке `apiPostSessionOperations` (`lib/api.js`).

## Механики

- `delay = min(retryDelayMs * 2^(n-1), maxRetryDelayMs) * (1 + (r*2-1)*ratio)`; roll клампится [0,1]; верхняя граница `maxRetryDelayMs * 1.3`.
- Конфиг: `frontend/src/features/process/bpmn/save/opsOutbox/opsOutboxConfig.js` (`retryDelayMs:1000`, `maxRetryDelayMs:8000`, `retryJitterRatio:0.3`, `keepaliveAbortMs:5000`).

## Не входит (осознанно)

- Warmup-gate после деплоя, access-log `$request_time`, read-only доступ к stage-хосту, приведение drift-инвентаря — бэклог-заметки по ветке H4 (FIX_REPORT «Рекомендуемое направление фикса»), отдельные контуры.
- `keepaliveBodyLimitBytes` (dead code) — отложено в step2 контура async-save.
