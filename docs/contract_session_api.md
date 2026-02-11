# Session API contract (draft)

Цель: сохранять и восстанавливать интервью‑сессию (actors → nodes/edges → вопросы/ответы → заметки), чтобы при F5 ничего не терялось.
Mermaid — временный превью. Цель экспорта — BPMN XML.

## Session shape (v0)

```json
{
  "session_id": "uuid-or-string",
  "title": "optional",
  "roles": [
    { "role_id": "cook_1", "label": "Повар 1" }
  ],
  "start_role": "cook_1",
  "nodes": [],
  "edges": [],
  "questions": [],
  "answers": [],
  "notes": [
    { "note_id": "note_...", "ts": "2026-02-11T12:00:00Z", "author": "user", "text": "..." }
  ]
}
```

Поля `nodes/edges/questions/answers` расширяем по мере реализации.

## Endpoints (минимум)

- `GET /api/sessions` — список сессий для TopBar
- `POST /api/sessions` — создать сессию
- `GET /api/sessions/{id}` — получить полную сессию
- `POST /api/sessions/{id}/notes` — добавить заметку
- `POST /api/sessions/{id}/answers` — записать ответ
- `GET /api/sessions/{id}/bpmn` — BPMN XML (для bpmn-js viewer)

## Notes

- Для фронта критично: сессия восстанавливается “как есть”.
- Желательно стабильные id: `note_id`, `question_id`.
- Если API недоступно — фронт держит draft в localStorage как fallback.
