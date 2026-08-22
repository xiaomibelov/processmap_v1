# REVIEW_BLOCKED

**Контур**: `fix/canvas-gpu-compositing-zoom-simplification-v1`  
**Run ID**: `20260528T210002Z-13339`  
**Reviewer**: Agent 3  
**Дата**: 2026-05-28  
**Статус**: BLOCKED

---

## Причина блокировки

**Runtime truth ≠ Source truth**

Код изменений существует в файловой системе (`/opt/processmap-test/frontend/src/...`) и успешно собран в `dist/`, но **запущенный dev-сервер `:5177` не отдаёт эти изменения**.

### Доказательства

| Проверка | `dist/` (файловая система) | `:5177` (runtime) | Результат |
|----------|---------------------------|-------------------|-----------|
| CSS `pan-active` | ✅ Присутствует (`index-CvjW-o7z.css`) | ❌ Отсутствует (`index-CkfowgWb.css`) | MISMATCH |
| CSS `zoom-simplified` | ✅ Присутствует | ❌ Отсутствует | MISMATCH |
| CSS `zoom-minimal` | ✅ Присутствует | ❌ Отсутствует | MISMATCH |
| CSS `translateZ(0)` | ✅ Присутствует | ❌ Отсутствует | MISMATCH |
| CSS `contain:` | ✅ Присутствует | ❌ Отсутствует | MISMATCH |
| JS `viewbox.changing` | ✅ Присутствует (`index-BZsO80iy.js`) | ❌ Отсутствует (`index-CsQv_w4w.js`) | MISMATCH |
| JS `bindGpuCompositingAndZoomHooks` | ✅ Присутствует | ❌ Отсутствует | MISMATCH |

### Процесс dev-сервера

```
PID 970049: node /app/node_modules/.bin/vite --host 0.0.0.0 --port 5177
CWD: /app
```

Процесс Vite запущен из `/app`, что отличается от рабочей директории проекта `/opt/processmap-test/frontend`. Файловая система `/app` недоступна из shell-окружения reviewer, что указывает на возможный Docker-контейнер или изолированный mount.

---

## Что нужно сделать для разблокировки

1. **Перезапустить dev-сервер `:5177` из корректной рабочей директории** (`/opt/processmap-test/frontend`), либо
2. **Пробросить изменения в окружение, где работает dev-сервер** (если `/app` — это mounted копия), либо
3. **Использовать production build из `dist/`** через nginx/static serve вместо Vite dev server.

После разблокировки reviewer повторит:
- curl `:5177` → подтверждение классов в served bundle
- Browser DevTools Layers/Performance проверку
- Real mouse drag FPS-измерение
- Zoom simplification верификацию

---

## Правило (AGENTS.md §3)

> «Правило: если `intended != served`, статус работы = `BLOCKED` до устранения расхождения.»
