# Runtime Proof :5177

## Шаги верификации

1. ✅ Dev-сервер `:5177` отвечает (HTTP 200)
2. ✅ Сборка frontend проходит без ошибок (`npm run build` — OK)
3. ✅ Страница `/app` загружается без JS-ошибок (единственная ошибка — 401 на `/api/auth/me`, не связана с изменениями)
4. ⚠️ Полная верификация FPS/SVG count требует авторизации и открытия сессии с диаграммой

## Проверка кода в runtime

Через DevTools Console на загруженной странице можно выполнить:

```js
// Проверить, что модуль загружен
window.__FPC_DEBUG_BPMN__ = true;
// Открыть сессию с BPMN-диаграммой
// После панорамирования проверить:
console.log('SVG nodes:', document.querySelectorAll('svg *').length);
```

## Доказательство ограниченности изменений

```bash
git diff --name-only
# frontend/src/components/process/BpmnStage.jsx
# frontend/src/features/process/bpmn/stage/decor/decorManager.js
# frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js
# frontend/src/features/process/bpmn/stage/viewport/cullBpmnViewport.js (новый)
```

Backend не затронут. `package.json` не изменён. bpmn-js core не изменён.
