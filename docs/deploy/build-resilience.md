# Деплой: устойчивость сборки к сетевым сбоям (build resilience)

Дата: 2026-08-04. Ветка: `fix/deploy-build-resilience`.

## Инцидент

Деплои #641 (00:25) и #642 (00:26) на stage упали: `frontend` — `sh: vite: not found` (exit 127), `api`/`notifications` — CANCELED. В логе: `npm error Exit handler never called!` на `npm ci` и каскад `Temporary failure in name resolution` у pip (pypi.org) и apt (deb.debian.org) в окне ~00:27–00:29 UTC.

## Диагностика (D1–D4)

- **D1 (сеть)**: сбой DNS на билд-хосте был **транзиентным и селективным**: `git fetch` (github.com) прошёл в 00:26:34, а registry.npmjs.org / pypi.org / deb.debian.org не резолвились до ~00:29. Оба ранна попали в одно окно флапа → не случайность одного рана и не конфигурация репо. Билд-хост (45.87.104.69) недоступен по SSH из CI-контура диагностики — хостовые проверки (resolv.conf, dmesg) остаются на владельце инфры.
- **D2 (жёсткость пайплайна)**: npm завершился с **exit code 0**, несмотря на `Exit handler never called!` — BuildKit пометил слой `npm ci` успешным (#19), и сборка дошла до `npm run build` (#30) без devDependencies → `vite: not found`. Это известный класс багов npm при сетевом обрыве. Вывод: нельзя доверять exit-коду `npm ci`, нужен **артефактный гард**.
- **D3 (конфиг)**: `node:20-alpine`, `.npmrc` = `legacy-peer-deps=true`, registry по умолчанию. `deploy/deploy.sh` всегда строит с `--no-cache` (freshness-инвариант) → каждая сборка скачивает все зависимости по сети (максимальная экспозиция к флапам). `apk add git` в `frontend/Dockerfile.prod` не использовался (git-зависимостей в package.json нет).
- **D4 (воспроизводимость)**: 2/2 фейла в окне флапа; до и после окна деплои стабильны (серия успехов 07-31 → 08-02). npm debug-лог остался на билд-хосте.

## Что исправлено (F1–F4)

1. **`frontend/Dockerfile` + `frontend/Dockerfile.prod`**:
   - артефактный гард: после `npm ci` проверяется `test -x node_modules/.bin/vite` — молчаливое падение npm (exit 0) теперь фейлит **этап зависимостей** с понятным сообщением, а не `vite: not found` на этапе сборки;
   - retry ×3 с backoff (15s/30s) — переживает транзиентный DNS-флап;
   - BuildKit cache mount `/root/.npm` — тарболлы кэшируются между `--no-cache`-деплоями (cache mounts не сбрасываются `--no-cache`) → сетевая экспозиция повторных сборок минимальна;
   - build-arg `NPM_REGISTRY` — опциональный внутренний mirror без правок кода;
   - `Dockerfile.prod`: удалён неиспользуемый `apk add --no-cache git` (один сетевой шаг меньше).
2. **`Dockerfile` (api)**: pip retry ×3 с backoff + `--timeout 60`; cache mount `/root/.cache/pip` (поэтому `--no-cache-dir` убран — кэш живёт в mount, не в слое); build-arg `PIP_INDEX_URL`.
3. **`backend/services/notifications/Dockerfile`**: apt-get update/install с retry ×3; pip — аналогично api.
4. **`deploy/deploy.sh`**: без изменений — `set -euo pipefail` уже fail-fast; `--no-cache` сохранён (freshness), cache mounts работают поверх.

## Как включить mirror (если внешние registry недоступны по политике)

На билд-хосте в `.env`/окружении деплоя передать build-args (docker compose `build.args` или `docker build --build-arg`):

- npm: `NPM_REGISTRY=https://<internal-npm-mirror>/`
- pip: `PIP_INDEX_URL=https://<internal-pypi-mirror>/simple`

Дефолт (пустые значения) — публичные registry, поведение как раньше.

## Приёмка

1. Локальная сборка `frontend` образа (docker build, BuildKit) — DONE, `vite build` собран.
2. Симуляция отказа registry (`NPM_REGISTRY` на мёртвый хост) — сборка падает **на этапе npm ci** с `[build] npm ci failed after 3 attempts ... — dependency stage FAILED`, до `npm run build` не доходит.
3. Повторный деплой stage ×2 после мерджа — стабильно; `/version` отдаёт актуальный SHA.

Код продукта не менялся — только Dockerfile'ы и эта документация.
