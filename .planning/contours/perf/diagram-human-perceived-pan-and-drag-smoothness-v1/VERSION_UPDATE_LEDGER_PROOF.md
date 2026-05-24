# VERSION_UPDATE_LEDGER_PROOF

**Contour:** `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`  
**Run ID:** `20260516T213420Z-31691`

---

## Изменение версии

- **Старая версия:** `v1.0.131`
- **Новая версия:** `v1.0.132`
- **Файл:** `frontend/src/config/appVersion.js`
- **SHA:** `5b20bc2`
- **Timestamp:** `2026-05-16T22:00:01.849Z`
- **Contour ID:** `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`

---

## Changelog entry

```js
{
  version: "v1.0.132",
  changes: [
    "CSS interaction-mode: filter снят и will-change: transform добавлен во время pan/drag — снижена paint cost.",
    "shape-rendering: crispEdges во время взаимодействия — меньше rasterization-затрат на dense SVG.",
    "applyPropertiesOverlayDecorForZoomChange подавлен при активном pan/drag — убраны лишние итерации по всем элементам.",
    "DiagramInteractionMode: pointer-event binding с threshold 5px для точного определения interaction.",
  ],
}
```

---

## Runtime proof

- Footer на `:5180` отображает **«Версия v1.0.132»**.
- `window.__PROCESSMAP_BUILD_INFO__.currentVersion` → `"v1.0.132"`.
- Метка версии не перекрывает canvas (проверено скриншотом).
- `build-info.json` валиден и содержит корректный `contourId`.
