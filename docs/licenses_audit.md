# Аудит лицензий зависимостей

Дата аудита: 2026-03-02  
Режим: read-only по коду и зависимостям (без обновления пакетов и lock-файлов)

## 1) Фиксация контекста

- Branch: `feat/paths-polish-v1`
- HEAD: `518744f`
- Менеджеры зависимостей:
  - Frontend: `npm` (источник истины: `frontend/package-lock.json`)
  - Backend: `pip` (источник истины: `backend/requirements.txt`)
- Проверенные файлы lock/manifest:
  - Есть: `frontend/package.json`, `frontend/package-lock.json`, `backend/requirements.txt`
  - Не обнаружены: `frontend/pnpm-lock.yaml`, `frontend/yarn.lock`, `backend/pyproject.toml`, `backend/poetry.lock`

## 2) Сгенерированные артефакты

- `artifacts/sbom_frontend.cdx.json` (CycloneDX, frontend)
- `artifacts/sbom_backend.cdx.json` (CycloneDX, backend)
- `artifacts/licenses_frontend.csv` (`name,version,license,repository`)
- `artifacts/licenses_backend.csv` (`name,version,license,homepage`)
- Дополнительно (вспомогательные файлы диагностики):  
  `artifacts/npm_ls.json`, `artifacts/licenses_frontend.json`, `artifacts/licenses_backend.json`

## 3) Объём инвентаризации

- Frontend packages: **157**
- Backend packages: **24**
- Всего в аудите: **181**

## 4) Правила оценки риска

- **High**: `AGPL`, `SSPL`, `Commons Clause`, `Commercial`, `Proprietary`, пустая/`UNKNOWN`/`NOASSERTION` лицензия
- **Medium**: `GPL`, `LGPL`, `Custom`, а также лицензии вне списка “Low”, требующие ручной проверки
- **Low**: `MIT`, `Apache-2.0/Apache 2.0`, `BSD`, `ISC`, `MPL-2.0`

## 5) Таблица рисков (проблемные пакеты: High/Medium)

| Package | Version | License | Scope (prod/dev) | Risk level | Why |
|---|---:|---|---|---|---|
| foodproc-process-copilot-frontend | 0.0.0 | UNLICENSED | unknown | High | В package metadata нет открытой лицензии; формально не OSS-лицензия |
| anyio | 4.12.1 | UNKNOWN | prod | High | Не удалось подтвердить лицензию из собранных метаданных |
| click | 8.3.1 | UNKNOWN | prod | High | Не удалось подтвердить лицензию из собранных метаданных |
| httptools | 0.7.1 | UNKNOWN | prod | High | Не удалось подтвердить лицензию из собранных метаданных |
| idna | 3.11 | UNKNOWN | prod | High | Не удалось подтвердить лицензию из собранных метаданных |
| pip | 26.0.1 | UNKNOWN | prod | High | Не удалось подтвердить лицензию из собранных метаданных |
| typing_extensions | 4.15.0 | UNKNOWN | prod | High | Не удалось подтвердить лицензию из собранных метаданных |
| urllib3 | 2.6.3 | UNKNOWN | prod | High | Не удалось подтвердить лицензию из собранных метаданных |
| websockets | 16.0 | UNKNOWN | prod | High | Не удалось подтвердить лицензию из собранных метаданных |
| caniuse-lite | 1.0.30001769 | CC-BY-4.0 | dev | Medium | Лицензия вне базового “Low” набора; нужна юридическая проверка условий атрибуции |

Сводка по уровням риска:
- High: **9**
- Medium: **1**
- Low: **171**

## 6) Пакеты с UNKNOWN / NOASSERTION

- `anyio@4.12.1`
- `click@8.3.1`
- `httptools@0.7.1`
- `idna@3.11`
- `pip@26.0.1`
- `typing_extensions@4.15.0`
- `urllib3@2.6.3`
- `websockets@16.0`

## 7) Пакеты без repository/homepage

- Frontend (без repository): `foodproc-process-copilot-frontend@0.0.0`
- Backend (без homepage): не обнаружено

## 8) Dual-license

По собранным данным (`licenses_frontend.json` / `licenses_backend.json`) dual-license записей не обнаружено.

## 9) Топ-10 проблемных пакетов

1. `foodproc-process-copilot-frontend@0.0.0` — `UNLICENSED` (High)
2. `anyio@4.12.1` — `UNKNOWN` (High)
3. `click@8.3.1` — `UNKNOWN` (High)
4. `httptools@0.7.1` — `UNKNOWN` (High)
5. `idna@3.11` — `UNKNOWN` (High)
6. `pip@26.0.1` — `UNKNOWN` (High)
7. `typing_extensions@4.15.0` — `UNKNOWN` (High)
8. `urllib3@2.6.3` — `UNKNOWN` (High)
9. `websockets@16.0` — `UNKNOWN` (High)
10. `caniuse-lite@1.0.30001769` — `CC-BY-4.0` (Medium)

## 10) Рекомендации (без изменения зависимостей в этом задании)

1. Для 8 backend-пакетов с `UNKNOWN` провести точечную верификацию лицензий по upstream-источникам (PyPI/репозитории/файлы LICENSE) и зафиксировать результаты в policy-файле проекта.
2. Зафиксировать policy по `UNLICENSED` для собственных пакетов: добавить явную лицензию проекта (если это ожидаемое решение) или оформить внутреннее исключение.
3. Для `caniuse-lite (CC-BY-4.0)` согласовать юридически требования атрибуции и документировать исполнение.
4. Добавить CI-проверку лицензий (fail на `UNKNOWN/NOASSERTION/UNLICENSED` для third-party), чтобы не копить риски.
5. Разделить policy для `prod` и `dev`: dev-зависимости с нестандартной лицензией можно оставить при формальном исключении.
6. Сохранить текущие SBOM-файлы как baseline и сравнивать дифф при каждом релизе.
7. На следующий этап вынести remediation backlog: замена пакетов с нежелательными лицензиями, либо формальные исключения с owner/expiry.
8. Обновлять отчёт автоматически по расписанию (например, nightly), чтобы отслеживать появление новых `UNKNOWN`.

## 11) Проверка ограничений задачи (DoD)

- SBOM frontend и backend: **сформированы**
- CSV лицензий frontend и backend: **сформированы**
- Таблица рисков и список проблемных лицензий: **в отчёте присутствуют**
- Изменения зависимостей/lock-файлов: **не выполнялись**
