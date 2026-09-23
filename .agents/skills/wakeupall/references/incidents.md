# Интерпретация симптомов wakeupall (только диагноз, без починки)

Этот скилл не чинит. Задача — правильно локализовать и направить:
"wakeupstage" (stage), "wakeupprod" (prod), эскалация человеку.

## Матрица симптомов

| Симптом | Локализация | Направление |
|---|---|---|
| processmap.ru 000/timeout | gateway / сеть / TLS prod | wakeupprod (CRIT) |
| processmap.ru / 200, /version 502 | app-api-1 упал | wakeupprod |
| stage.processmap.ru / 200, /version 502 | processmap_stage-api-1 упал (crash-loop) | wakeupstage |
| Оба домена 000 | app-gateway-1 или сеть хоста | wakeupprod (gateway — prod-сущность; отметить влияние на stage) |
| Оба домена 502 | gateway жив, бэкенды обоих лежат (редко: ресурсы хоста) | wakeupprod + wakeupstage, сначала хост (диск/память) |
| unhealthy-контейнеры при Up | часто кривые пробы; проверить pg_isready/redis-cli | соответствующий скилл, приоритет низкий |
| диск ≥ 90% | хост | wakeupprod (cleanup после approve) — диск общий |
| память < 300MB | хост | эскалация + wakeupprod |
| SSL < 14 дней | хост/certbot | wakeupprod (renewal общий, после approve) |

## Реальные снапшоты (разведка 2026-08-22)

- Stage api crash-loop: `InFailedSqlTransaction` в `_ensure_schema` (storage.py) на boot,
  контейнер Restarting, stage /version = 502 при / = 200. Типовой паттерн "битая миграция".
- Все app-* и processmap_stage-postgres/redis/kanboard показывали unhealthy при Up 18h —
  массовый unhealthy ≠ реальный сбой; проверять реальную работу сервиса.
- Диск 62%, память available ~3.4GB — норма.
- Версия prod: `{"commit":"e1387bc7...","branch":"main","env":"prod"}`.

## Формат сводной таблицы в отчёте

| Окружение | Доступность | Код | Время | Контейнеры up | Статус |
|---|---|---|---|---|---|
| prod | https://processmap.ru | 200 | 0.06s | 9/9 | OK |
| stage | https://stage.processmap.ru | 200/502 | 0.06s | 7/8 | CRIT |

Плюс: хост (диск/память/gateway/SSL) и рекомендации "запусти wakeupX для починки".
