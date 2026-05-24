# PROPERTIES_SOURCE_TRUTH_CHECKLIST

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`

## Обязательная классификация

Каждый source должен получить один статус:

- `confirmed current source`;
- `available but not suitable for this contour`;
- `hypothesis/future`;
- `requires backend/API work later`.

## Проверить

- [ ] BPMN element properties доступны read-only без XML writes.
- [ ] Camunda/Zeebe extension attributes уже parsed и доступны page-safe способом.
- [ ] `bpmn_meta` source documented, включая exact fields.
- [ ] `nodes_json / edges_json / bpmn_meta_json` реально exposed to frontend, если используются.
- [ ] Diagram property overlays не используются как durable truth без доказательства.
- [ ] DoD/quality/role/lane/equipment/product-related properties не превращаются в fake rows.
- [ ] Process step metadata source shape documented before use.
- [ ] Existing property panel models mapped only if read-only.
- [ ] Product Actions registry data не используется как properties registry truth.

## Required source proof

- [ ] Source file/path.
- [ ] Runtime data path.
- [ ] Field mapping to registry row.
- [ ] Scope semantics: workspace/project/session.
- [ ] Metrics formulas.
- [ ] Filters mapping.
- [ ] Mutation proof: no BPMN XML/Product Actions/backend writes.
