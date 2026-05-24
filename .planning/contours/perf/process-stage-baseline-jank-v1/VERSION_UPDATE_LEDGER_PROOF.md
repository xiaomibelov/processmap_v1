# Доказательство версии — perf/process-stage-baseline-jank-v1

## Версия

- **Текущая версия**: `v1.0.131`
- **Предыдущая версия**: `v1.0.130`
- **Файл**: `frontend/src/config/appVersion.js`

## Changelog v1.0.131

```
Стабилизация draft-ссылок: useStableDraft предотвращает лишние re-render при идентичном содержимом.
Memo-границы для BpmnStage, InterviewStage и ProcessStageDiagramControls: снижен React baseline jank.
Снижена частота polling undo/redo (5с) и remote sync (15с): меньше лишних задач на main thread.
```

## Runtime proof

### build-info.json
```json
{
  "branch": "fix/lockfile-sync-test",
  "sha": "5b20bc2d1292f419647238eaf37dac55f9315942",
  "shaShort": "5b20bc2",
  "timestamp": "2026-05-16T20:43:07.734Z",
  "contourId": "perf/process-stage-baseline-jank-v1",
  "dirty": true,
  "host": "clearvestnic.ru"
}
```

### window.__PROCESSMAP_BUILD_INFO__
- ✅ Присутствует в runtime.
- ✅ Совпадает с `build-info.json`.

### UI proof
- ✅ Строка «Версия v1.0.131» видна в footer.
- ✅ Changelog текст («Стабилизация draft-ссылок...») виден рядом.
- ✅ Маркер версии расположен в footer, не на canvas.

### JS asset
- ✅ Новый hash: `index-B9Zb1QlF.js` (отличается от предыдущего `index-CrJUzrye.js`).
