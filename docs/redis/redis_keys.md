# Redis keyspace (reserved prefixes)

This file defines reserved key prefixes for ProcessMap/Food Process Copilot.

## Prefixes

- `pm:lock:*`
  - Distributed locks (short TTL).
  - Examples: edit/session lock, report generation lock.

- `pm:cache:*`
  - Derived/read-through caches.
  - Examples: computed views, report payload cache.

- `pm:idem:*`
  - Idempotency keys.
  - Examples: prevent duplicate POST side effects.

- `pm:rl:*`
  - Rate-limit counters/buckets.
  - Examples: AI operations, API burst limits.

## Naming guideline

Pattern:

`<prefix><scope>:<entity>:<id>[:<extra>]`

Example:

- `pm:lock:session:abc123`
- `pm:cache:report:org42:sess77:path9`
- `pm:idem:api:post_report:uuid`
- `pm:rl:user:u17:ai_questions`

## TTL policy (initial)

- Locks: 15s-120s
- Cache: 30s-15m (per data volatility)
- Idempotency: 5m-24h (per endpoint semantics)
- Rate-limit: window-specific (e.g. 60s/300s)

