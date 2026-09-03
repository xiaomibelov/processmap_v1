# PR: fix/header-and-breadcrumbs

## Что исправлено

- Глобальный explorer header увеличен до токена 3.5rem, фактическая высота project header стала 57px.
- Tabs в header выровнены по центру ряда и больше не выглядят сжатыми.
- Project screen приведён к тому же паттерну, что workspace: global header / context toolbar / table header.
- Поиск и кнопка Новая сессия перенесены из project global header в project-filter-toolbar.
- Direct open проекта теперь получает полный путь от backend: организация / workspace / раздел / папка / проект.
- Backend ProjectPage расширен полями context и breadcrumbs; docs/openapi.yaml регенерирован штатным скриптом.
- TextBreadcrumbs получил maxVisible, чтобы пятиуровневый путь проекта не схлопывался в многоточие на desktop.

## Тесты

- Backend direct project open: OK.
- Backend workspace access controls: 10 tests OK.
- Backend workspace access controls + explorer context fields: 14 tests OK.
- Frontend focused contracts: 25/25 passed.
- Frontend explorer suite без существующего локального SessionCreateModal Node 22 blocker: 195/195 passed.
- Frontend build: exit 0.
- OpenAPI update/lint: exit 0, Redocly valid.

## UI proof

- До: project header 37px, project toolbar отсутствовал, search/create были в global header, breadcrumbs показывали только проект.
- После: project header 57px, project toolbar 53px, search/create находятся в context toolbar, breadcrumbs показывают Default / Main Workspace / Раздел витрин / Папка прямого входа / Проект хлебных крошек.
- Скриншоты до/после сохранены в .planning/contours/fix/header-and-breadcrumbs/evidence/.

## Известное

- Docker daemon локально не запущен, поэтому UI proof снят через uvicorn SQLite runtime + Vite + Playwright.
- Полный explorer node-test локально упирается в существующий SessionCreateModal.test.mjs blocker под Node 22; связанные с этим контуром тесты зелёные.

Merge только после approve владельца.
