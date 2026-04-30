---
atlas_fallback: true
contour: fix/session-refetch-after-bpmn-save-nonblocking-v1
source_branch: fix/session-refetch-after-bpmn-save-nonblocking-v1
date: 2026-04-30
obsidian_status: OBSIDIAN_WRITE_BLOCKED
---

# 05_Карта сохранения и CAS

## Durable BPMN save ack отделён от background sync

> [!summary] Контракт
> Успешный `PUT /api/sessions/{id}/bpmn -> 200` является durable ack для BPMN XML. Полный `GET /api/sessions/{id}` после этого может обновлять session hydration в фоне, но не является условием успешного сохранения.

```mermaid
sequenceDiagram
  participant UI as UI save control
  participant Boundary as XML save boundary
  participant Server as API
  UI->>Boundary: save with base_diagram_state_version
  Boundary->>Server: PUT /api/sessions/{id}/bpmn
  alt 200 OK
    Server-->>Boundary: storedRev + diagram_state_version
    Boundary-->>UI: durable saved
    Boundary-->>UI: local fallback session patch
    Boundary->>Server: GET /api/sessions/{id}
    Server-->>Boundary: hydrated full session
    Boundary-->>UI: background session sync
  else 409 Conflict
    Server-->>Boundary: DIAGRAM_STATE_CONFLICT
    Boundary->>Server: GET /api/sessions/{id}
    Boundary->>Server: retry PUT with fresh base when rebase possible
    Boundary-->>UI: success only if retry PUT succeeds
  else PUT failure
    Server-->>Boundary: error
    Boundary-->>UI: save failure
  end
```

| Сценарий | Поведение |
| -------- | --------- |
| `PUT /bpmn 200` | UI может показать `Сохранено на сервере`; `diagram_state_version` берётся из ack |
| Background `GET /session` success | `onSessionSync` применяет hydrated session позже |
| Background `GET /session` failure | durable save остаётся successful; UI показывает warning/info о background refresh |
| `PUT /bpmn` failure | durable success не показывается |
| `PUT /bpmn 409` | conflict остаётся реальной save error, либо retry только через существующий rebase path |

> [!warning] CAS не скрывать
> `409 Conflict` после `PUT /bpmn` остаётся реальной ошибкой сохранения. Nonblocking sync относится только к успешному durable `PUT /bpmn`. Background refresh failure не должен маскировать save success, но и не должен скрывать failed durable write.

Source links:

| Файл / функция | Контракт |
| -------------- | -------- |
| `persistCamundaExtensionsViaCanonicalXmlBoundary` | `onDurableSaveAck` вызывается только после successful `apiPutBpmnXml` |
| `isDiagramStateConflict` | 409 / `DIAGRAM_STATE_CONFLICT` остаётся отдельной веткой |
| `buildFallbackSessionPatch` | local session state получает `bpmn_xml`, `bpmn_meta`, `bpmn_xml_version`, `diagram_state_version` из durable ack |
