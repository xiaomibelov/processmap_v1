# RUNTIME_PROOF_5177.md

**Контур**: `fix/canvas-gpu-compositing-zoom-simplification-v1`
**Run ID**: `20260528T210002Z-13339`
**Дата обновления**: 2026-05-28T22:30Z

---

## curl proof

```bash
$ curl -I http://localhost:5177/
HTTP/1.1 200 OK
Server: nginx/1.27.5
Content-Type: text/html
Cache-Control: no-cache, no-store, must-revalidate
```

```bash
$ curl -I http://localhost:5177/app?project=70d1c5ffaf&session=9a8030f136
HTTP/1.1 200 OK
```

## Build proof

```bash
$ cd /opt/processmap-test/frontend && npm run build
✓ 1014 modules transformed.
✓ built in 35.45s
dist/assets/index-BZsO80iy.js    3,224.17 kB
dist/assets/index-CvjW-o7z.css     582.12 kB
```

## Deploy proof (обновлено)

```bash
$ docker cp /opt/processmap-test/frontend/dist/. processmap-test-gateway-1:/usr/share/nginx/html/
$ docker exec processmap-test-gateway-1 nginx -s reload
```

nginx-контейнер (`processmap-test-gateway-1`) теперь отдаёт актуальный `dist/`.

## Source = Runtime verification

### CSS bundle (`index-CvjW-o7z.css`)

| Правило | В `dist/` | В `:5177` | Результат |
|---------|-----------|-----------|-----------|
| `pan-active` | ✅ | ✅ (curl grep = 1) | PASS |
| `zoom-simplified` | ✅ | ✅ (curl grep = 1) | PASS |
| `zoom-minimal` | ✅ | ✅ (curl grep = 1) | PASS |
| `translateZ(0)` | ✅ | ✅ (curl grep = 1) | PASS |
| `contain:` | ✅ | ✅ (curl grep = 1) | PASS |

### JS bundle (`index-BZsO80iy.js`)

| Символ | В `dist/` | В `:5177` | Результат |
|---------|-----------|-----------|-----------|
| `"pan-active"` | ✅ | ✅ (curl grep = 1) | PASS |
| `"zoom-simplified"` | ✅ | ✅ (curl grep = 1) | PASS |
| `"zoom-minimal"` | ✅ | ✅ (curl grep = 1) | PASS |
| `"zoom-full"` | ✅ | ✅ (curl grep = 1) | PASS |
| `canvas.viewbox.changing` | ✅ | ✅ (curl grep = 1) | PASS |
| `canvas.viewbox.changed` | ✅ | ✅ (curl grep = 1) | PASS |

**Примечание**: имена функций (`bindGpuCompositingAndZoomHooks`, `updateZoomClass` и др.) отсутствуют в бандле из-за minification / inlining, но их строковые литералы и логика присутствуют.

### Browser verification (Playwright)

```js
// document.styleSheets check
{
  foundPanActive: true,
  foundZoomSimplified: true,
  foundZoomMinimal: true,
  foundContain: true,
  cssLink: "http://localhost:5177/assets/index-CvjW-o7z.css"
}
```

## Console errors
- 1 ошибка в консоли (не связана с изменениями — `401 Unauthorized` на `/api/auth/me`)
- Нет ошибок рендеринга BPMN

## Ограничения
- DevTools Layers / Performance profile не собраны автоматически (требуется интерактивный Chrome DevTools)
- Реальный mouse drag не проверен (требует Agent 3 Reviewer с доступом к диаграмме)
