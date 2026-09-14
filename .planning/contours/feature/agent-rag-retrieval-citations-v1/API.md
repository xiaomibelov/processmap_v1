# API — feature/agent-rag-retrieval-citations-v1 (E2)

## AgentChatOut (backend/app/schemas/agent_chat.py, backend/services/agent/schemas.py)

```jsonc
{
  "ok": true,
  "status": "ok",
  "error": "",
  "message": "Заявку оформляет оператор.",        // маркеры [Sn] вырезаны
  "action": null,
  "action_payload": {},
  "usage": { ... },
  "projection_digest": "…",
  "sources": [                                    // NEW; null — retrieval не участвовал
    {
      "source_id": "chunk_b_1",                   // chunk_id из /api/rag/search (G1)
      "source_type": "bpmn_xml",
      "session_id": "sess_b",                     // null для справочников
      "session_title": "Сессия B: …",             // null если нет в metadata
      "process_layer": null,                      // as_is|to_be после мержа E1 #972
      "element_id": "elem_b_1",                   // навигация под E5
      "element_name": "Оформить заявку",
      "snippet": "В сессии B заявку…",            // ≤200 символов
      "score": 1.5
    }
  ]
}
```

## SSE (POST /sessions/{id}/agent/stream)

Новый ивент (после токенов, до `done`), additive:

```
event: sources
data: {"sources": [ <SourceRef>, … ]}

event: done
data: {"usage": {…}, "projection_digest": "…", "sources": [ <SourceRef>, … ] | null}
```

- `sources` в `done` продублирован для клиентов, не желающих слушать отдельный ивент,
  и для hit-пути schema_overview (там token-ивентов нет, sources=null).
- Ивент `sources` не эмитится, когда цитат нет; пустой массив в `done` означает
  «retrieval участвовал, модель ничего не процитировала»; null — «retrieval не
  участвовал / деградация».

## Промпт-контракт (внутренний)

- Отрывки нумеруются `[S1] … [Sn]` с заголовком `[Si] <session_title|element_name|source_type>`.
- Инструкция: цитировать только переданные отрывки; маркер вне диапазона —
  физически не существует для парсера (guard G4).
- Trim-ladder: полные → top 3 → top 2 (snippet 100) → titles-only → без RAG;
  выбирается по остатку `PROCESSMAN_MAX_TOTAL_PROMPT_TOKENS` (default 4096).

## Env

| Переменная | Default | Назначение |
|---|---|---|
| `PROCESSMAN_RAG_FREE_ANSWER_TOP_K` | 4 | org-wide bpmn_xml в free-answer |
| `PROCESSMAN_RAG_OVERVIEW_TOP_K` | 3 | текущая сессия в schema_overview miss |
| `PROCESSMAN_RAG_TOP_K` | 5 | (существующая) doc_qa / structured_fact |

## Обратная совместимость

Additive-only: новое опциональное поле схемы + новый SSE-ивент. Старые клиенты
получают `sources: null` и не видят `sources`-ивент. OpenAPI регенерирован,
redocly lint 0 ошибок.
