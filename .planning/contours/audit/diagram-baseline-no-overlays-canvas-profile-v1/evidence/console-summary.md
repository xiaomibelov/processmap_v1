# Console Summary

## Errors
```
[ERROR] Failed to load resource: the server responded with a status of 401 (Unauthorized)
  @ http://clearvestnic.ru:5180/api/auth/me
[ERROR] Failed to load resource: the server responded with a status of 401 (Unauthorized)
  @ http://clearvestnic.ru:5180/api/sessions/4c515d1c6e/presence
```

- **Count**: 2 errors total
- **Type**: HTTP 401 Unauthorized
- **Source**: Auth initialization race condition
- **Pre-existing**: Yes (observed in all previous audits)
- **Performance impact**: None

## Warnings
- None

## Debug Logs
- None observed (debug flags not enabled)

## Performance-Related Logs
- None

## Summary
Console is clean of performance-related errors or warnings. The only errors are pre-existing auth race conditions that do not affect canvas performance.
