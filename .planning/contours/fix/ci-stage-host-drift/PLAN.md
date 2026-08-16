# PLAN — ci-stage-host-drift (fix)

## Проблема
CI-workflow `.github/workflows/deploy-stage.yml` (бывш. «Deploy to Stage», теперь «Deploy to Legacy Host»)
зелёный, но деплоит по ssh в `/opt/processmap/app` на хосте из секрета `STAGE_HOST` — это НЕ stage
clearvestnic.ru:5177. intended ≠ served: разработчики верят, что merge в main обновляет stage, но реальный
stage обновляется только ручным запуском `/root/processmap_v1/deploy/deploy.sh` на сервере.

## Сделано в этом контуре
- Workflow переименован в «Deploy to Legacy Host» + шаг-дисклеймер в начале job'а.
- README: строка правды о ручном деплое stage.
- Branch protection проверена (см. отчёт): required checks нет, переименование безопасно.

## Вариант (а) — перенастроить deploy-stage.yml на реальный stage-хост (НЕ реализовано)
1. Перевести target workflow на clearvestnic-хост: секреты `STAGE_HOST`/`STAGE_USER`/`STAGE_SSH_KEY`
   должны указывать на сервер clearvestnic (или новые секреты `STAGE_REAL_*`).
2. Унифицировать путь деплоя: CI должен вызывать тот же `deploy/deploy.sh` (или эквивалентный сценарий),
   чтобы состав сервисов (`api frontend agent notifications`) и health-ожидания совпадали с ручным путём.
3. После деплоя — гейт `./verify-deploy.sh` (MATCH по версии + agent container running).

## Что нужно от владельца
- Подтверждение целевого хоста: какой именно сервер считается «stage» (clearvestnic vs STAGE_HOST).
- Доступы: ssh-ключ для CI на clearvestnic-хост (секреты в GitHub), либо решение оставить ручной деплой.
- Решение: один canonical путь деплоя stage (CI или ручной) — сейчас их два, отсюда drift.
