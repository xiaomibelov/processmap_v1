# Design Spec: To-Be слой — документы на BPMN canvas

Дата: 2026-07-21
Статус: draft для одобрения
Предшественники: TO-BE-CONCEPT-AUDIT-2026-07-21.md, LOAD-FREEZE-AUDIT-2026-07-21.md, PR #579 (search dim), PR #580 (chunked mount + toggle persist)

## 1. Цель и принципы

Слой «To-Be» — документы (Google Docs и др.) как overlay-карточки на BPMN canvas. Принципы (performance-first):

1. **Минимум DOM**: ≤2 DOM-ноды на документ. Никаких iframe/thumbnail на canvas.
2. **Не блокировать main thread**: чанкинг маунта (PR #580), ленивый рендер вне viewport.
3. **Toggle как V2**: вкл/выкл без unmount, персистентно в localStorage.
4. **Переиспользование**: координатор маунта, dim при поиске, storage-паттерн toggle'ей.
5. Preview — только в модалке (Google Docs не даёт inline-редактирование; это зафиксировано в концепт-аудите).

## 2. Выбранный вариант: «Icon + Title» (Вариант 1)

На canvas — компактная карточка **120×40px**: иконка 📄 + заголовок (1-2 строки, ellipsis). Нейтральный фон `slate-50`, тонкий border, опциональный цветной left-accent по привязке.

Почему не thumbnail (Вариант 2): image fetch на каждый документ блокирует paint и требует placeholder-логики; реальная польза thumbnail на 200px минимальна — превью живёт в модалке.
Почему не floating panel (Вариант 3): теряется пространственная привязка документа к элементу — главная ценность фичи.

DOM на документ: `<div class="fpc-tobe-doc">` + `<span class="fpc-tobe-doc-title">`. Иконка — inline SVG в wrapper (без дополнительной ноды через `background-image` или один SVG-элемент).

## 3. Архитектура

### 3.1. Рендер

- Новый модуль `frontend/src/features/process/tobe/`:
  - `tobeDocumentModel.js` — нормализация/валидация записей, извлечение `docId` из URL.
  - `tobeOverlayRenderer.js` — создание DOM-хоста карточки (аналог `createV2OverlayHost`, но проще).
  - `tobeOverlayCoordinator.js` — тонкая обёртка над общим mount-механизмом: **переиспользуем чанкинг и epoch-токен из `v2OverlayCoordinator.js`** (вынести их в shared-хелпер `mountChunked` либо обобщить координатор на второй тип хостов — решение при имплементации, предпочтительно обобщение).
  - `useTobeLayer.js` — state слоя, toggle, интеграция с save pipeline.
- Позиционирование: HTML overlay через bpmn-js `overlays.add()` (как V2). Свободные (free-floating) документы — overlay на корневом элементе диаграммы с абсолютным offset.

### 3.2. Viewport culling (ленивый рендер)

`applyViewportCulling()` уже существует (`v2OverlayCoordinator.js:159`) и применяется перед маунтом — документы вне viewbox (+margin 200px) не маунтятся вообще. При pan/zoom — ремаунт по тому же циклу, что V2 (существующий viewport-sync). IntersectionObserver **не нужен**: culling на уровне координатора дешевле и уже проверен.

### 3.3. Чанкинг

Первые ≤12 документов — синхронно (instant first paint), остальные — по кадрам через `scheduler.yield()`/rAF, epoch-токен отменяет устаревшие чанки. Механизм из PR #580 без изменений.

### 3.4. Toggle

- `toBeLayerEnabled` в `App.jsx` (рядом с `v2OverlaysEnabled`), persist в localStorage по образцу `v2OverlayToggleStorage.js` (новый `tobeLayerToggleStorage.js`, ключ `processmap_tobe_layer_enabled`).
- Выкл: CSS-класс на контейнере canvas (`fpc-tobe-hidden`) → `display: none` на всех `.fpc-tobe-doc`. **Без unmount** — toggle мгновенный.
- UI: кнопка «Документы» в сайдбар-блоке DisplaySettings рядом с «V2-оверлеи».

### 3.5. Dim при поиске

Существующий механизм (#579): `applySearchOverlayDimOnInstance` тогглит `fpcSearchOverlayDim` на `.fpc-overlay-v2-host`. Расширить селектор на `.fpc-tobe-doc` по `data-fpc-element-id` (для привязанных документов). Документ без привязки — не dim'ается (или dim по совпадению title в query — Phase 2).

### 3.6. Модалка `TobeDocumentPreviewModal`

- iframe `https://docs.google.com/document/d/{docId}/preview` (public docs); fallback при ошибке загрузки — плейсхолдер «Превью недоступно» + ссылка.
- Actions: «Открыть в Google Docs» (`/edit`, новая вкладка), «Скачать PDF» (`/export?format=pdf`), «Копировать ссылку», «Закрыть».
- Размер: ~860×640, responsive. По образцу `DrawioEditorModal.jsx` (shell, focus trap, Escape).

### 3.7. Хранение

- Массив `to_be_documents` в session JSON (та же save pipeline, что `drawio_elements_v1` — сервер хранит блоб, backend-схема не меняется). **НЕ в BPMN XML**: документы — To-Be аннотация, не BPMN-семантика (концепт-аудит, §3.7). Если позже понадобится переживать экспорт BPMN — отдельная миграция в `camunda:extensionElements`.
- Запись:

```json
{
  "id": "doc-uuid",
  "type": "document",
  "anchorElementId": "task_123 | null",
  "x": 100, "y": 50,
  "title": "Production Plan Q3",
  "url": "https://docs.google.com/document/d/ABC123/edit",
  "docId": "ABC123",
  "color": "#2563eb | null",
  "visible": true
}
```

### 3.8. Добавление документа (Phase 1, минимум)

Кнопка «+ Документ» в панели слоя → форма (URL + title + опционально элемент) → запись в массив → маунт. Drag'n'drop позиционирование — Phase 2 (создание рядом с выделенным элементом по умолчанию).

## 4. Файлы

Новые:
- `frontend/src/features/process/tobe/tobeDocumentModel.js`
- `frontend/src/features/process/tobe/tobeOverlayRenderer.js`
- `frontend/src/features/process/tobe/tobeOverlayCoordinator.js`
- `frontend/src/features/process/tobe/useTobeLayer.js`
- `frontend/src/features/process/tobe/TobeDocumentPreviewModal.jsx`
- `frontend/src/features/process/bpmn/stage/utils/tobeLayerToggleStorage.js`
- `frontend/src/styles/.../tobe-doc.css` (или дополнение legacy_bpmn.css)
- тесты: `tobeDocumentModel.test.mjs`, `tobeOverlayRenderer.test.mjs`

Изменяемые:
- `frontend/src/App.jsx` — `toBeLayerEnabled` state + persist
- `frontend/src/components/sidebar/displaySettings/DisplaySettingsBlock.jsx` — кнопка слоя
- `frontend/src/components/process/BpmnStage.jsx` — маунт слоя, dim-селектор
- `frontend/src/features/process/bpmn/stage/overlay/v2OverlayCoordinator.js` — обобщение чанкера (если выбран этот путь)
- save pipeline — поле `to_be_documents` в сериализации драфта

Backend: **без изменений** (session JSON blob).

## 5. Performance checklist (acceptance)

- [ ] ≤2 DOM-ноды на документ на canvas
- [ ] Нет iframe/img на canvas (только модалка)
- [ ] Viewport culling активен (вне viewbox+200px — не маунтится)
- [ ] Чанкинг: первые 12 синхронно, далее yield каждый кадр
- [ ] Toggle без unmount (display:none), persist в localStorage
- [ ] Dim при поиске работает на документах (CSS-класс, без DOM-мутаций)
- [ ] Long task при маунте 50 документов < 50 мс на чанк
- [ ] `npm run build` ✅, overlay tests зелёные

## 6. План коммитов (после одобрения)

1. `feat: toBe layer toggle (state, persist, sidebar button)`
2. `feat: toBe document overlay renderer + coordinator (icon+title, chunked mount, viewport culling)`
3. `feat: TobeDocumentPreviewModal (iframe preview + actions)`
4. `feat: search dim integration for toBe documents`
5. `feat: persist to_be_documents in session save pipeline`
6. `feat: add-document form (URL + title + anchor)` — опционально в Phase 1

## 7. Phase 2 (out of scope)

Drag'n'drop позиционирование, private docs через OAuth (Drive API), thumbnails, clone doc, dim для free-floating документов по title-match, экспорт документов в BPMN XML.
