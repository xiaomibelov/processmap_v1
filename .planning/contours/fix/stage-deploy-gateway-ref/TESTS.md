# TESTS — Smoke-test stage-deploy-gateway-ref

## Проверка YAML syntax
```bash
cd /root/processmap_v1
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-stage.yml'))"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-stage-ref.yml'))"
```
- Ожидаем: отсутствие ошибок парсинга.

## Проверка docker compose config (stage)
```bash
cd /opt/processmap/app  # или /root/processmap_v1
APP_ENV_FILE=.env.stage docker compose \
  --env-file .env.stage \
  -f docker-compose.yml \
  -f docker-compose.stage.yml \
  -p processmap_stage \
  config > /dev/null
```
- Ожидаем: `config` проходит без ошибок.

## Проверка отсутствия gateway в stage-конфиге
```bash
grep -n "gateway" docker-compose.yml docker-compose.stage.yml
```
- Ожидаем: нет упоминаний сервиса `gateway` (только возможные алиасы `stage-gateway`).

## Проверка workflow
```bash
grep -n "gateway" .github/workflows/deploy-stage.yml .github/workflows/deploy-stage-ref.yml
```
- Ожидаем: нет упоминаний `gateway`.

## Ручной stage-deploy (после merge)
- Запустить workflow `Deploy to Stage` из ветки `main`.
- Убедиться, что контейнер `processmap_stage-frontend-1` поднялся и healthy.
- `curl -I http://stage-url/` → 200, `Server: nginx`.

## Критерии приёмки
- [ ] `docker compose config` для stage проходит без ошибок.
- [ ] В stage workflow нет упоминаний `gateway`.
- [ ] Stage-deploy CI завершается успешно.
- [ ] Стенд stage доступен и отдаёт статику.
