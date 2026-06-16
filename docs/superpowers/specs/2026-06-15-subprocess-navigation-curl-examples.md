# Subprocess Navigation — curl examples

## Navigate into call activity
```bash
curl -s -X POST "http://localhost:8011/api/sessions/{session_id}/subprocess/{element_id}/navigate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Org-Id: $ORG_ID" \
  -H "Content-Type: application/json" | jq
```

## Navigate with explicit target
```bash
curl -s -X POST "http://localhost:8011/api/sessions/{session_id}/subprocess/{element_id}/navigate?target_element_id={target_id}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Org-Id: $ORG_ID" \
  -H "Content-Type: application/json" | jq
```

## Return to parent
```bash
curl -s -X POST "http://localhost:8011/api/sessions/{subprocess_session_id}/return" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Org-Id: $ORG_ID" \
  -H "Content-Type: application/json" | jq
```

## Example response (navigate)
```json
{
  "subprocess_session_id": "a1b2c3d4e5",
  "target_element_id": "user_task_1",
  "breadcrumbs": [
    { "session_id": "root123", "name": "Root process", "element_id": null },
    { "session_id": "a1b2c3d4e5", "name": "Подпроцесс: Process_sub", "element_id": "call_activity_1" }
  ]
}
```
