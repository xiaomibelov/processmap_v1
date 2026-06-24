# PR — fix/stage-deploy-gateway-ref-v2

## Заголовок
infra: stage-deploy — убрать остаточные обращения к `gateway` в deploy-скриптах

## Описание
- `fix/stage-deploy-gateway-ref` заменил `gateway` на `frontend` в stage workflow.
- Stage-deploy всё равно падал с `no such service: gateway` после старта контейнеров.
- Причина: `deploy/scripts/stage_freshness_proof.sh`, `server_update.sh`, `server_first_deploy.sh` всё ещё обращались к `gateway`.

## Изменения
- `deploy/scripts/stage_freshness_proof.sh`: сервис `gateway` → `frontend`, `GATEWAY_CID` → `FRONTEND_CID`.
- `deploy/scripts/server_update.sh`: убран `gateway` из `docker compose up`.
- `deploy/scripts/server_first_deploy.sh`: убран `gateway` из `docker compose up`.
- `deploy/deploy.sh`: поправлен комментарий.

## Тестирование
- Статический анализ `bash -n` — PASS.
- `grep gateway` в `deploy/scripts/` — не находит сервис `gateway`.

## Как проверить после merge
1. Запустить `Deploy to Stage` workflow.
2. Убедиться, что шаг `verify-chain` проходит без `no such service: gateway`.

## Checklist
- [ ] Stage-deploy CI PASS
- [ ] Approve пользователя
