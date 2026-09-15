# STAGE_MODEL_MAP — инвентарь модели стадий ProcessMap

> Контур: audit/tobe-stage-model-v1. Источник: локальный снимок БД 2026-09-15 + код
> `backend/app/domains/storage/canvas_session/repository.py` @ ae91569b.
> Код не изменялся; БД — только SELECT.

## 1. Словари осей

### 1.1 process_layer (колонка sessions.process_layer, default 'as_is')

| Значение | Живых | Удалённых | Примечание |
|---|---|---|---|
| as_is | 1786 | 1 | 99,89% живых сессий |
| to_be | 2 | 0 | 0,11% живых; обе — root, project d7d6689637, org_default, mode quick_skeleton, созданы 2026-08-17 |
| (пусто/прочее) | 0 | 0 | дихотомия, пустых нет |

Прочие оси рядом:
- **mode**: '' (956), 'quick_skeleton' (830 живых as_is + 2 to_be). Не стадийная ось
  (формат создания), но пересекается: обе to_be — quick_skeleton.
- **parent_session_id** (160 непустых, все as_is): ось субпроцесс-дерева, НЕ пары TO BE.
- **deleted_at**: мягкое удаление; 1 удалённая as_is, удалённых to_be нет.

### 1.2 interview_json->stage

- Непустых interview_json: 174/1788 живых (9,7%).
- Ключ `stage`: **0 вхождений** — ось дегенеративна на снимке.
- Код всё ещё читает её: `repository.py:265` (`"stage": interview.stage`) —
  в explorer-ответе поле stage всегда ''.

### 1.3 status (для контраста)

- `interview.status` читается в `repository.py:264` (default 'draft') — статусная
  ось сессий существует отдельно от стадийной; на снимке распределение status
  в interview_json не измерялось (вне скоупа контура).

## 2. Статусные оси: карта

| Ось | Где живёт | Кто читает | Активность на снимке |
|---|---|---|---|
| process_layer | sessions.process_layer | rollup `_load_tobe_links` :303, фильтр stage :731-737, `_tobe_leaf_overview` :286 | **единственная рабочая стадийная ось** (2 to_be) |
| interview.stage | sessions.interview_json (JSON) | `repository.py:265` (поле ответа) | мертва (0/174) |
| серверный параметр `stage` | query-параметр API explorer | :731-737 — маппится на process_layer | рабочий, но именуется как interview-ось |
| derived_from_session_id | sessions.derived_from_session_id | `_load_tobe_links` :310-312, карта :657-665 | единственный канал пары AS IS→TO BE (2 ссылки, обе валидны) |
| parent_session_id | sessions.parent_session_id | дерево субпроцессов :630-631, :983, :1040-1066 | 160 сессий; к парам TO BE отношения не имеет |

## 3. Code-часть: что реально делает rollup/counters

Файл `backend/app/domains/storage/canvas_session/repository.py` (1287 строк):

| Логика | Строки | Содержание |
|---|---|---|
| `_session_to_explorer_dict` | :251-277 | отдаёт process_layer (:266, default as_is) и мёртвый interview.stage (:265) |
| `_tobe_leaf_overview` | :280-295 | to_be-лист → counters{as_is:0,to_be:1}; as_is-лист с живой связью → {as_is:1,to_be:1} (двойной бейдж) |
| `_load_tobe_links` | :298-328 | одним SELECT: живые root-to_be проекта → map derived_from_session_id → MAX(updated_at); фильтр org_id/project_id/ACL |
| карта live_tobe_updated | :653-665 | повторение той же логики поверх загруженных строк |
| rollup | :704-716 | суммирование counters вверх по parent_session_id-дереву; tobe.last_updated_at = MAX по поддереву; stage_badges из сумм |
| серверный фильтр stage | :731-737 | stage=as_is|to_be → фильтр по process_layer; оба значения = без фильтра |

Ключевые свойства логики:
1. Пара определяется ТОЛЬКО по derived_from_session_id (root-to_be, тот же project/org).
2. Связь «живая» = to_be не удалена; **свежесть as_is относительно to_be не проверяется**
   (в данных 1 из 2 пар имеет as_is новее to_be — бейдж это не отражает).
3. subprocess-to_be (parent_session_id <> '') выпадают из карты связей — их as_is-родители
   не получат TO BE-бейдж (на снимке таких нет; риск на будущее).
4. Двойной счёт: as_is с to_be-связью даёт as_is=1 И to_be=1 — суммы counters по проекту
   превышают число сессий (намеренно, бейдж-семантика).

## 4. Карта пар AS IS↔TO BE (снимок)

| to_be | as_is-источник | project | Δupdated_at | as_is новее? | provenance контент (xml/meta) |
|---|---|---|---|---|---|
| 34ddc5a40f «TO BE overlay test» | b01bb10549 «phase5 llm3» | d7d6689637 | −941 сек | да (v3 vs v2) | пусто / '{}' |
| edbeb21c98 «TO BE from empty» | cee3891a54 «empty AS IS» | d7d6689637 | 0 | нет (v2=v2) | пусто / '{}' |

- Метод derived_from: 2 пары. Метод name-based: 0. Пересечение: 0.
- Сироты: 0. Удалённых to_be: 0.
- Обе to_be — пустые каркасы (bpmn_xml='', activity_count=0, bpmn_meta_json='{}'),
  созданы и обновлены в один день — похожи на тестовые записи.

## 5. Выводы для модели стадий

1. **Реальная стадийная модель = одна ось (process_layer) + один канал связи
   (derived_from_session_id).** Ось interview.stage мертва и дублирует семантику,
   не добавляя информации; контракт explorer-ответа содержит двусмысленное поле `stage`.
2. **Provenance-first оправдан данными:** контент-носителей связи нет (xml/meta пустые),
   колонка — единственный источник. Но это и single point of failure: 0 сирот сегодня,
   механизма восстановления связи при потере derived_from нет.
3. **Sync-индикатор отсутствует в коде:** рассинхрон версий пары (as_is новее to_be)
   в UI не детектируется — кандидат в метрику зрелости пары.
4. EVIDENCE GAP: выводы по to_be опираются на 2 записи на снимке; перенос на prod
   требует прямого prod-SELECT (в этом окружении недоступен).
