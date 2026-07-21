# Аудит: мелкосекундное зависание после загрузки схемы

Дата: 2026-07-21
Режим: read-only, код не изменялся, коммитов нет.
Метод: статический анализ кода + рантайм-профилирование (Playwright + CDP CPU Profiler + PerformanceObserver longtask) на dev-инстансе `processmap_v1` (NL-сервер, доступ через SSH-туннель `localhost:15177`), браузер Chromium headless, viewport 1600×950.

## 1. Воспроизведение

- Сценарий: логин (`admin@local`) → org Default → раздел «TO BE v0.3кукук» → проект TOBE → сессия «Борщ с мраморной говядиной (v0.3)» (65 BPMN-элементов на canvas).
- URL сессии: `/app?project=d3b9ae9fda&session=f1f727aee7`.
- Продолжительность freeze (блокирующее время main thread в первые ~7с после клика по сессии): **~520–580 мс** суммарно, самый длинный таск — **219 мс**. Это и есть ощущаемое «мелкосекундное зависание».
- Отдельно: **загрузка приложения в целом (boot)** тяжёлая — серия из 17 long tasks суммарно **~4.7 с** в первые ~6 секунд после навигации (до открытия сессии).

## 2. Performance flame chart (longtask timeline, клик по сессии на t≈16.7с)

| start, ms | duration, ms | интерпретация |
|---|---|---|
| 17043 | 157 | начало загрузки сессии/диаграммы (fetch + importXML) |
| 17497 | 53 | — |
| 17564 | 219 | **основной freeze**: рендер диаграммы + маунт overlays/decor |
| 23583 | 87 | догрузка (sidebar/данные) |
| 45893 | 65 | фоновая активность |

CPU-профиль (CDP Profiler, 12с окно reload сессии, топ self-time):
- `(program)` 1579 мс, `q9` 1287 мс, `Z5` 720 мс, `kUe` 652 мс, `BBe` 514 мс (index bundle, минифицировано, sourcemaps на сервере нет — 404);
- **`parseFromString` 263 мс** — XML-парсинг (bpmn-js `importXML` / DOMParser) — единственная атрибутируемая «тяжёлая» нативная функция;
- `setItem` 173 мс — localStorage записи;
- GC 183 мс — заметного GC-spike нет.

## 3. Гипотезы

| Гипотеза | Подтверждена? | Доказательство | Время |
|---|---|---|---|
| A: bpmn-js importXML блокирует main thread | **Частично ДА** | `parseFromString` 263 мс в профиле; importXML синхронно парсит и раскладывает схему внутри промиса (`bpmnRenderRuntimeLifecycle.js:63,250`) | ~260-300 мс |
| B: V2 overlay render блокирует | **НЕТ (на этой схеме)** | A/B профиль тогла V2-оверлеев на 8 карточках: дельта CPU скромная, профиль почти не отличается от baseline. НА БОЛЬШИХ схемах (100+ элементов) вклад растёт линейно — см. статику ниже | <100 мс здесь |
| C: Draw.io SVG patch | НЕТ | нет характерных блоков; SVG-кэш (H5) работает | — |
| D: Sidebar/properties | НЕ доказано | отдельного пика нет; вклад растворён в общем React-времени | — |
| E: React state cascade | **ДА (главный фактор)** | CPU размазан по десяткам функций бандла без одного доминанта — типичная картина каскада рендеров/commit-фаз после загрузки сессии | основная часть ~500 мс |
| F: WASM/worker | НЕТ | не обнаружено | — |
| G: GC | НЕТ | 183 мс за 12с — фоновый уровень | ~180 мс |

## 4. Статический анализ (что выполняется после loader в один кадр)

`BpmnStage.jsx` + `bpmnRenderRuntimeLifecycle.js` — после `importXML` подряд, без уступок main thread:

1. `importXML` — парсинг + layout (`bpmnRenderRuntimeLifecycle.js:63,250`);
2. `ensureCanvasVisibleAndFit` — zoom-fit layout (`:310`);
3. `overlayLifecycle.mountFromBpmn(modeler, "editor")` (`BpmnStage.jsx:4702`) — полный обход `elementRegistry` + создание DOM-хостов;
4. Effect `BpmnStage.jsx:4709`: `extractOverlaysFromBpmn()` вызывается **дважды** (viewer + editor) и результат сериализуется в `JSON.stringify` для сигнатуры ремаунта;
5. `mountFromBpmn` внутри вызывает `extractOverlaysFromBpmn` **ещё раз** (`v2OverlayCoordinator.js:299`);
6. Далее decorManager, robotMeta-оверлеи, DrawioOverlayRenderer.

Итого реестр элементов обходится **3–4 раза** подряд + сериализация + создание сотен DOM-нод в одном кадре — на больших схемах это и есть freeze. На тестовой схеме (65 элементов) суммарно ~0.5 с.

## 5. Ключевой bottleneck

Не одна функция, а **серия синхронной работы на main thread без yield'ов** между «loader скрыт» и «canvas интерактивен»: importXML → fit → 3-4 полных прохода по elementRegistry → маунт overlays/decor → React commit-каскад. Ощущаемый freeze 200-500 мс на средней схеме; растёт линейно с числом элементов и overlay-карточек.

## 6. Рекомендации по фиксу

1. **Устранить дублирующие обходы реестра** (low complexity, low risk): `extractOverlaysFromBpmn` сейчас считается 3 раза на инстанс (сигнатура в effect + внутри `mountFromBpmn` ×2). Считать один раз, передавать в сигнатуру и в маунт. Файлы: `BpmnStage.jsx:4709-4760`, `v2OverlayCoordinator.js:293-312`. Эффект: минус ~30-40% overlay-времени на больших схемах.
2. **Разбить маунт overlays на чанки с уступкой кадра** (medium): `mount()`/`renderForElement` батчами по N элементов через `scheduler.yield()`/`setTimeout(0)`/`requestIdleCallback` — freeze превращается в постепенное появление карточек без блокировки ввода. Файл: `v2OverlayCoordinator.js`. Риск: карточки появляются не мгновенно — нужен визуальный акцепт.
3. **Встроить постоянную инструменталку** (low): `performance.mark/measure` вокруг importXML, fit, mountFromBpmn, signature-effect — чтобы freeze измерялся из коробки (сейчас `performance.getEntriesByType('measure')` пуст).
4. **Включить sourcemaps на dev/stage-сборке** (low): без них CPU-профили читаются только до уровня минифицированных имён.

Побочная находка (не freeze): **тогл «V2-оверлеи» не персистится** — после reload страницы он сбрасывается в off (`v2OverlaysEnabled` — React state в `App.jsx:900`). Если пользователи включают V2 постоянно, стоит сохранять в localStorage. Отдельный маленький фикс.

## 7. Приоритет

**Medium.** Freeze 200-500 мс раздражает, но не блокирует работу; на больших схемах (100+ элементов с V2) может превращаться в 1-2 с — там уже high. Начать с рекомендации 1 (дешёво, безопасно), затем 2.

## Ограничения измерений

- Headless Chromium, схема среднего размера (65 элементов, 8 V2-карточек); на больших схемах абсолютные числа будут выше.
- Sourcemaps отсутствуют → атрибуция до минифицированных имён; нативные функции (parseFromString, setItem, GC) атрибутированы точно.
- Dev-инстанс в NL через туннель: на сетевую часть (fetch XML) RTT влияет, на main-thread freeze — нет.
