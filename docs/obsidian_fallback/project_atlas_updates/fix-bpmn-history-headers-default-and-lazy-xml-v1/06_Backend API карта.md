---
title: "06 Backend API карта"
type: project-atlas-update
contour: fix/bpmn-history-headers-default-and-lazy-xml-v1
date: 2026-05-01
status: source-tested
---

## BPMN version history API

> [!summary] Backend contract unchanged
> Backend уже поддерживает нужное разделение: list endpoint по умолчанию headers-only, detail endpoint возвращает XML одной версии.

| Endpoint | Назначение | Поля | Исключено |
| -------- | ---------- | ---- | --------- |
| `GET /api/sessions/{id}/bpmn/versions?limit=50` | Список версий | id, version_number, created_at, source_action, author/display metadata, hashes/counts при наличии | `bpmn_xml`, если нет `include_xml=1` |
| `GET /api/sessions/{id}/bpmn/versions/{version_id}` | Деталь версии | metadata + `bpmn_xml` одной версии | другие версии |
| `POST /api/sessions/{id}/bpmn/restore/{version_id}` | Restore-forward | новая версия/diagram state ack | bulk XML list |

> [!warning] Ограничение использования
> `include_xml=true` нельзя использовать для обычного history list. Для preview/restore UI должен ходить в single-version detail.

Source proof:

| Файл | Доказательство |
| ---- | -------------- |
| `backend/app/_legacy_main.py` | `include_xml` у list route имеет default `0`; single-version route существует |
| `backend/app/storage.py` | `bpmn_xml` выбирается в list storage только при `include_xml=True` |
| `frontend/src/lib/apiRoutes.js` | `include_xml=1` отправляется только при `options.includeXml === true` |
| `frontend/src/lib/api.js` | `apiGetBpmnVersion` читает одну версию |
