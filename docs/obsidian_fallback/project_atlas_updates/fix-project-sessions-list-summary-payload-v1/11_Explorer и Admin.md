---
atlas_note: "11_Explorer и Admin"
contour: "fix/project-sessions-list-summary-payload-v1"
status: "implemented-source-tested"
date: "2026-04-30"
source: "fallback"
---

# 11_Explorer и Admin

> [!summary]
> Bootstrap списка сессий проекта теперь использует лёгкий summary contract. Full detail грузится при открытии конкретной session через `GET /api/sessions/{session_id}`.

## Влияние

| Область | До | После | Риск |
| ------- | -- | ----- | ---- |
| Project/session bootstrap | `apiListProjectSessions()` тянул full sessions list | `apiListProjectSessions()` вызывает `?view=summary` | Низкий: открытие session и дальше делает full `apiGetSession` |
| TopBar session title | Брал `title/name/id` из full row | Те же поля есть в summary | Низкий |
| Session open | Full row мог уже быть в памяти, но open path всё равно вызывает full detail | Full detail явно deferred до open | Низкий |
| Explorer project page | Использует отдельный `/api/projects/{id}/explorer` path | Не менялся | Вне scope |
| Admin | Admin endpoints не менялись | Не менялись | Вне scope |

> [!warning]
> Explorer project page всё ещё имеет отдельный storage path `list_project_sessions_for_explorer()`. Этот contour не оптимизирует его, потому что runtime audit показал основной bottleneck именно на `GET /api/projects/{id}/sessions`.

Связанные заметки: [[06_Backend API карта]], [[15_Backlog контуров]].
