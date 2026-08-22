# Manual Test Results

## Контур
`fix/viewport-culling-regression-v1`

## Среда
- **URL:** http://localhost:5177
- **Session:** `9a8030f136` (Perf test session, 231 elements)
- **Browser:** Chromium headless (Playwright)
- **Build:** production bundle

## Тест-кейсы

### 1. Diagram loads initially
| Шаг | Результат | Статус |
|-----|-----------|--------|
| Открыть сессию | Canvas загрузился, shapes видны | ✅ PASS |
| SVG nodes | 513 | ✅ |
| Shapes | 122 | ✅ |
| Connections | 108 | ✅ |

**Скриншот:** `bpmn_canvas_initial.png`

### 2. Pan right (start leaves viewport)
| Шаг | Результат | Статус |
|-----|-----------|--------|
| Pan right 300px | Canvas сдвинулся, viewport transform: `matrix(1,0,0,1,300,0)` | ✅ PASS |
| Shapes on right | Видны (Start 1, Task 1.1, Lane 1.1) | ✅ PASS |
| Shapes on left | Ушли за viewport (bpmn-js internal culling) | ✅ OK |
| SVG nodes после pan | 405 | ✅ |
| **НЕТ исчезновения ВСЕХ shapes** | — | ✅ PASS |

**Скриншот:** `bpmn_canvas_panned_right.png`

### 3. Pan back left (restore)
| Шаг | Результат | Статус |
|-----|-----------|--------|
| Pan left 300px | Canvas вернулся к началу | ✅ PASS |
| viewport transform | `matrix(1,0,0,1,0,0)` | ✅ PASS |
| Shapes восстановились | 22 visible, 513 SVG nodes | ✅ PASS |
| **NO shape disappearance** | — | ✅ PASS |

**Скриншот:** `bpmn_canvas_panned_back.png`

### 4. Zoom out
| Шаг | Результат | Статус |
|-----|-----------|--------|
| Zoom out 1 level | Масштаб уменьшился | ✅ PASS |
| viewport transform | `matrix(0.8,0,0,0.8,66.4,42)` | ✅ PASS |
| Shapes scale correctly | Да | ✅ PASS |
| NO disappearance | — | ✅ PASS |

**Скриншот:** `bpmn_canvas_zoom_out.png`

### 5. Scrubber
| Шаг | Результат | Статус |
|-----|-----------|--------|
| Scrubber visible | "Hide scrubber" button present | ✅ PASS |
| Slider present | `role="slider"`, `aria-valuenow=0` | ✅ PASS |
| Slider range | 0–100 | ✅ PASS |

### 6. Console errors
| Шаг | Результат | Статус |
|-----|-----------|--------|
| Errors during test | 0 BPMN errors | ✅ PASS |
| Only 401 on /api/auth/refresh | Expected (no refresh token) | ✅ PASS |

## Вывод
Все тесты PASS. Регрессия устранена.
