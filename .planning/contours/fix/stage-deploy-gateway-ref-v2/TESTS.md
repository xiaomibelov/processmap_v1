# TESTS — fix/stage-deploy-gateway-ref-v2

## Статический анализ
```bash
cd /root/processmap_v1
bash -n deploy/scripts/stage_freshness_proof.sh
bash -n deploy/scripts/server_update.sh
bash -n deploy/scripts/server_first_deploy.sh
bash -n deploy/deploy.sh
```
- Все скрипты должны парситься без ошибок.

## Поиск остаточных gateway в deploy-скриптах
```bash
grep -rni "gateway" deploy/scripts/ deploy/deploy.sh
```
- Ожидаем: нет обращений к сервису `gateway` (только возможные упоминания prod/SSL edge в других файлах).

## Stage freshness proof (локально, без контейнера)
```bash
# prepare-source
deploy/scripts/stage_freshness_proof.sh prepare-source \
  --requested-ref main \
  --resolved-sha $(git rev-parse HEAD)

# verify-chain (требует запущенного processmap_stage-frontend-1)
deploy/scripts/stage_freshness_proof.sh verify-chain \
  --requested-ref main \
  --resolved-sha $(git rev-parse HEAD)
```
- Ожидаем: `source fingerprint proof: PASS`, `freshness proof: PASS`.

## CI stage-deploy
- Запустить workflow `Deploy to Stage` из `main`.
- Ожидаем: успешное выполнение всех шагов, включая `verify-chain`.

## Критерии приёмки
- [ ] `grep gateway` в `deploy/scripts/` не находит сервис `gateway`.
- [ ] `stage_freshness_proof.sh` проходит для запущенного stage-frontend.
- [ ] Stage-deploy CI завершается успешно.
