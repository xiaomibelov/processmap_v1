# Fix Applied

## Контур
`fix/viewport-culling-regression-v1`

## Стратегия
**Option C (отключение culling)** — emergency fix, prioritizing stability over performance.

## Изменения

### Файл: `frontend/src/components/process/BpmnStage.jsx`

**Убран import `createViewportCuller`:**
```diff
-import { createViewportCuller, isGfxInDom } from "../../features/process/bpmn/stage/viewport/cullBpmnViewport";
+import { isGfxInDom } from "../../features/process/bpmn/stage/viewport/cullBpmnViewport";
```

**Закомментировано создание viewer culler:**
```diff
-        viewerCullerRef.current = createViewportCuller(v, { ... });
+        // CULLING DISABLED — emergency fix for viewport-culling-regression-v1
+        // viewport culling caused shapes to disappear permanently on pan.
+        // viewerCullerRef.current = createViewportCuller(v, { ... });
```

**Закомментировано создание modeler culler:**
```diff
-            modelerCullerRef.current = createViewportCuller(m, { ... });
+            // CULLING DISABLED — emergency fix for viewport-culling-regression-v1
+            // viewport culling caused shapes to disappear permanently on pan.
+            // modelerCullerRef.current = createViewportCuller(m, { ... });
```

**`isGfxInDom` оставлен** — используется в `decorManager.js` как guard для overlay creation.
При отключенном culling он всегда возвращает `true`, что безопасно.

**Dispose culler оставлен** — при переключении сессий старый culler (если был создан до fix) корректно dispose'ится.

## Почему не revert всего коммита?
- `cullBpmnViewport.js` содержит `isGfxInDom`, который используется другими модулями.
- `isGfxInDom` guard в `decorManager.js` полезен сам по себе (предотвращает создание overlay на несуществующих элементах).
- Полный revert затронул бы 4 файла и 364 строки; минимальное отключение — 2 строки.

## Build
```bash
npm run build  # ✅ 32.55s, без ошибок
```

## Git
```
9dcbe05a fix(viewport-culling-regression): disable viewport culling to restore canvas stability
```
