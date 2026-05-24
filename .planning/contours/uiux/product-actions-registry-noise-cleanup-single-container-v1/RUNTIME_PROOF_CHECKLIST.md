# Runtime Proof Checklist (Agent 4)

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`

## A. Pre-runtime

- [ ] `WORKER_2_DONE` существует и непустой.
- [ ] `WORKER_3_DONE` существует и непустой.
- [ ] `RAG_PREFLIGHT_REVIEWER.md` присутствует.
- [ ] Reviewer запустил собственный RAG preflight на свою роль.

## B. Runtime smoke (fresh context)

```bash
TS=$(date +%s)
curl -sI "http://clearvestnic.ru:5180/?cb=${TS}" | head -20
```

- [ ] HTTP 200.
- [ ] Заголовки `Cache-Control: no-cache` / отсутствие агрессивного кеширования.
- [ ] Версия из `appVersion.js` присутствует в build-info / DOM-метке версии и инкрементирована относительно предыдущего commit.

## C. IA / Analytics preservation

- [ ] Раздел верхнего уровня **«Аналитика»** виден в навигации.
- [ ] Внутри Аналитики видны: Реестр действий, Реестр свойств, Дашборды.
- [ ] Переход в «Реестр действий с продуктом» работает.
- [ ] Возврат «Вернуться» возвращает в Аналитика-Hub.

## D. Page structure

- [ ] Header c title 18/700, subtitle 13/`#6B7280`, «Вернуться», CSV/XLSX.
- [ ] CSV/XLSX встречаются **ровно один раз** во всём DOM страницы реестра.
- [ ] Scope tabs: active underline 2px `#7C3AED`, inactive `#9CA3AF`.
- [ ] 16px зазор между tabs и контейнером.
- [ ] Один белый контейнер: radius 12, border `#E5E7EB`, тень `0 1px 3px rgba(0,0,0,0.06)`, padding 0.
- [ ] Внутренние секции разделены 1px `#F3F4F6`, full-width.

## E. Sections compliance

- [ ] Workspace scope: default collapsed, chevron rotates, текст `Workspace scope · N сессий, M строк`.
- [ ] Sessions workspace: компактный список (не таблица), кнопка «Открыть сессию» с фоном `#7C3AED`.
- [ ] Metrics: одна текстовая строка, число 20/700 `#111827`, лейбл 11/uppercase `#9CA3AF`. Без подложек.
- [ ] Число «неполных» — `#F59E0B`.
- [ ] Filters: одна строка селекторов 34px, reset — text-link `#6B7280`, helper-text 12/`#9CA3AF`.
- [ ] Warning row: иконка `#F59E0B` + текст `#B45309` + линк `#7C3AED`. **Без жёлтой подложки, без бордера.**
- [ ] AI row: label + chips + кнопка `#7C3AED` + счётчик. **Без gradient, без подложки.**
- [ ] Таблица: header `#FAFAFA`, hover `#FAFAFA`, колонки 20/25/35/20, badges зелёный/оранжевый, BPMN code subdued.
- [ ] Раскрытие строки: chevron поворачивается, max-height transition, 4 read-only поля (ID/BPMN/Сессия/Дата).

## F. Forbidden patterns runtime

- [ ] DevTools: нет CSS-правил с `linear-gradient` / `radial-gradient` в скоупе реестра.
- [ ] Нет `border-style: dotted/dashed`.
- [ ] Нет `box-shadow` внутри контента (исключение — внешняя тень главного контейнера).
- [ ] Нет цветных подложек у metric-блоков.
- [ ] Нет card-in-card.
- [ ] Нет stagger row animation.
- [ ] Нет фейковых данных.

## G. Empty / populated state

- [ ] При наличии данных — таблица заполнена, метрики реальные.
- [ ] При отсутствии — пустое состояние без фейков.

## H. Safety

- [ ] В консоли браузера нет ошибок при навигации, раскрытии строки, переключении scope, сбросе фильтров.
- [ ] Сетевой инспектор: при чтении/навигации нет PUT/PATCH/DELETE.
- [ ] BPMN XML / Product Actions / backend / schema / RAG не изменялись (по diff).

## I. Verdict

- REVIEW_PASS — все блоки A–H пройдены, runtime-снимки сохранены.
- CHANGES_REQUESTED — любой из пунктов A–H не выполнен; список расхождений в `REVIEW_REPORT.md`.
- BLOCKED — если runtime недоступен или версия не обновлена.
