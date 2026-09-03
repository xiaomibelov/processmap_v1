# fix/session-count-semantics — план

## Цель

Убрать смешение сессий и материализованных подпроцессов во внешних счетчиках workspace explorer / folder / project / sidebar.

## Контекст

- Контракт `fix/projects-table-ux-polish/API.md` подтверждает, что explorer уже использует `GET /api/projects/{project_id}/explorer` и получает session rows с assignees без новых endpoint'ов.
- В `backend/app/domains/storage/explorer/repository.py` project/folder aggregates считали все rows таблицы `sessions`, включая child rows с `parent_session_id`.
- Frontend уже предпочитает `trackable_sessions_count` / `descendant_trackable_sessions_count`; исправление должно быть на backend, не вычитанием на клиенте.

## Шаги

1. Добавить regression test: проект с 3 root sessions и 148 subprocess rows должен отдавать `sessions_count=3`, `trackable_sessions_count=3`, `done_sessions_count=1`.
2. Изменить workspace explorer aggregation: `sessions_count` и progress rows считают только root sessions (`COALESCE(parent_session_id, '') = ''`).
3. Изменить legacy workspace dashboard aggregation: `session_count` у проектов/пользователей и summary игнорируют subprocess rows.
4. Зафиксировать frontend contract на отображение `1/3 сессии` при наличии `subprocesses_count=148`.
5. Прогнать targeted backend/frontend tests, lint/build по возможности.

