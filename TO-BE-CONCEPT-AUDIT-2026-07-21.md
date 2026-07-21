# Концептуальный аудит: «To Be» слой с документами на BPMN canvas

Дата: 2026-07-21
Режим: read-only, код не менялся, коммитов нет.

## Executive summary

Рекомендуется **Вариант B (document attachment через property) как Phase 1** и **Вариант A/C (To-Be overlay слой) как Phase 2**. Причина: вся инфраструктура для B уже существует (camunda:properties, V2 overlay cards, sidebar), фича доставляется за дни без новых подсистем; полноценный позиционируемый слой документов (A/C) — это новый overlay-тип + storage + UI режим, его имеет смысл строить после валидации спроса на B. Inline-редактирование Google Docs на canvas невозможно ни в одном варианте (Google не даёт редактировать в iframe) — везде предлагается preview + «Открыть в Google Docs».

## 1. Существующие overlay/layer системы (что переиспользовать)

| Система | Что это | Рендер | Тогл | Пригодность для документов |
|---|---|---|---|---|
| **V2 overlay** | Карточки свойств из `camunda:properties` | HTML через bpmn-js `overlays.add()` (`v2OverlayCoordinator.js`) | «V2-оверлеи» в сайдбаре, теперь персистентный (#580) | **Высокая** — документ как property отображается без нового кода |
| **Draw.io overlay** | Авторские SVG-фигуры (rect/container/text/note) с presets | Отдельный SVG-слой (`DrawioOverlayRenderer.jsx`) | — (authoring через панель слоёв) | Средняя — новый тип фигуры «document» по образцу note |
| **bpmn-js native overlays** | API для HTML поверх canvas | HTML | — | Низкоуровневая основа, сама по себе ничего не даёт |
| **LayersPopover** | Панель слоёв Draw.io overlay'ей | React | показать/скрыть | Переиспользуется для панели документов |
| **Поиск + dim** (PR #579) | Подсветка/приглушение карточек | CSS классы | — | Готовая механика фокуса для To-Be режима |
| **Chunked mount** (PR #580) | Разбиение маунта карточек на кадры | — | — | Обязателен при 50+ карточках документов |

bpmn-js custom shapes для этой задачи не нужны: документы — не BPMN-элементы, а аннотации; overlay-инфраструктура покрывает все сценарии.

## 2. Google Docs integration constraints (проверено)

- **Iframe embed**: `https://docs.google.com/document/d/{ID}/preview` — работает для **public/published** docs; `X-Frame-Options` у Google Docs **отсутствует** (проверено по заголовкам), CSP содержит только `require-trusted-types-for` — preview встраивается. `/edit` в iframe — нет: для залогиненных редакторов открывается только в полном контексте Google, inline-редактирование в чужом iframe не поддерживается.
- **Простая ссылка**: `/document/d/{ID}/edit` в новой вкладке — работает всегда (для тех, у кого есть доступ). Единственный путь к редактированию.
- **Export/скачивание**: `/document/d/{ID}/export?format=pdf|docx|txt` — для public docs без auth; для private нужен OAuth.
- **API (private docs)**: OAuth 2.0, consent screen, scopes `drive.readonly`/`docs.readonly`, хранение refresh-токенов на backend — high complexity, отдельный эпик.
- **Thumbnail**: готового image-API нет; варианты — скрин первой страницы через export→pdf→рендер (тяжело) или generic иконка документа (прагматично).
- **Копирование (clone)**: только через Drive API `files.copy` + OAuth.

Вывод: **Phase 1 — public docs only** (URL + preview iframe + export-ссылка). OAuth — Phase 2 при необходимости.

## 3. Архитектурные варианты

### A. To-Be overlay (новый тип карточки на canvas)

Карточка-документ как V2-like overlay: заголовок + иконка, при клике — модалка с `/preview` iframe и кнопками «Открыть» / «Скачать PDF».
- DOM: HTML overlay через bpmn-js overlays (как V2), iframe только в модалке, не на canvas.
- Хранение: `to_be_documents` в session meta (JSON): `{ id, element_id|null, doc_url, title, x, y }`.
- UI: тогл «To Be» (по образцу V2 toggle, персистентный), панель списка документов (по образцу LayersPopover).
- Плюсы: видно на canvas, позиционируется, полный контроль UX.
- Минусы: новый overlay-тип + новое хранилище + CRUD UI; риск загромождения canvas.
- Сложность: **medium-high**.

### B. Document attachment (property-based)

Свойство `document_url` (можно зарегистрировать в org property dictionary) на BPMN-элементе. V2-карточка показывает строку со ссылкой; в sidebar ElementSettings — кнопка «Открыть документ». Клик — модалка preview или новая вкладка.
- DOM: ноль новых overlay'ей — расширение рендера property row (иконка по pattern `docs.google.com`) + модалка.
- Хранение: `camunda:property name="document_url"` в BPMN XML — документ переживает экспорт/импорт схемы, версионируется с ней.
- UI: V2 card row + sidebar + модалка preview.
- Плюсы: минимальный код, документ привязан к элементу семантически, V2-инфраструктура (цвета, поиск, dim) работает из коробки.
- Минусы: нет свободного позиционирования; документ «внутри» карточки, а не самостоятельный объект.
- Сложность: **low**.

### C. To-Be mode (режим карты: dim + floating панели)

Кнопка «To Be» в тулбаре: вся схема приглушается (готовая механика dim из #579), документы показываются floating-карточками с drag'n'drop; список — в сайдбаре.
- DOM: floating HTML panels поверх canvas + сайдбар.
- Хранение: как в A (`to_be_documents` в session meta).
- UI: режим переключается тоглом; вне режима canvas чистый.
- Плюсы: лучший UX при большом числе документов; canvas не страдает в обычном режиме.
- Минусы: новый UI-режим, DnD, управление панелями — самый большой объём работы.
- Сложность: **medium-high/high**.

## 4. Сравнение

| Критерий | A (overlay) | B (property) | C (mode) |
|---|---|---|---|
| Видно на canvas | да | частично (в карточке) | да (в режиме) |
| Позиционирование | да | нет | да |
| Inline-редактирование | нет (невозможно нигде) | нет | нет |
| Сложность | medium-high | **low** | medium-high/high |
| Переиспользование кода | среднее | **максимальное** | среднее (dim готов) |
| Риск performance | medium (новые overlay'и) | low | medium |
| Phase 1 (public docs) | да | **да** | да |
| Phase 2 (private/OAuth) | да | да | да |
| Привязка к элементу | опционально | **да (в XML)** | опционально |

## 5. Рекомендация

**Phase 1 (1-2 недели): Вариант B.**
1. Property `document_url` на элементах (через существующий properties UI).
2. V2 property row: если value — URL `docs.google.com/document/`, рендерить как ссылку с иконкой.
3. Модалка preview: `/preview` iframe + кнопки «Открыть в Google Docs» и «Скачать PDF» (`/export?format=pdf`).
4. Sidebar: поле document_url в ElementSettings с кнопкой открытия.

**Phase 2 (после валидации): Вариант A** — отдельный слой `to_be_documents` с позиционированием, тоглом и панелью; если документов будет много — эволюция в C (To-Be mode с dim, переиспользуя #579).

**Техдолг, который предусмотреть:** при >30 документах на схеме — чанкинг маунта (#580) обязателен; OAuth для private docs — отдельный эпик (consent screen, token storage); клонирование документов — только через Drive API, не обещать в Phase 1.

## 6. Next steps (после одобрения)

1. Design spec на Phase 1 (B): UI-макеты строки-ссылки и модалки, формат `document_url`.
2. Implementation plan: точечные файлы (`v2OverlayRenderer.js` row render, sidebar section, modal).
3. Прототип на одной схеме с 2-3 документами, демо пользователю.
