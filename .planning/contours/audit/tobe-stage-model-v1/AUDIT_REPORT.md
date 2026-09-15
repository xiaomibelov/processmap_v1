# AUDIT_REPORT — audit/tobe-stage-model-v1

> Agent 2 (Executor, audit-контур, строго read-only: БД — только SELECT; product code не изменялся).

## 0. Runtime / source truth

```text
pwd:                            /Users/mac/agents_place/kimi_PM/p0-work-audit-dbplane
git remote -v:                  origin git@github.com:xiaomibelov/processmap_v1.git (+ graphify remote, не использовался)
git branch --show-current:      audit/db-plane-measures-20260916
git rev-parse HEAD:             ae91569b31f0470935ef426a16c7242a1da12dbb
git rev-parse origin/main:      ae91569b31f0470935ef426a16c7242a1da12dbb
git status -sb:                 ## audit/db-plane-measures-20260916...origin/main (чисто; untracked — только артефакты .planning/)
git diff --name-only:           (пусто)
git diff --cached --name-only:  (пусто)
```

HEAD = origin/main, intended == served, расхождений нет.

### DB-plane substitution (DEVIATION, зафиксировано аудитором)

Прямой доступ к prod-БД в этом окружении отсутствует (SSH к хосту 45.87.104.69 вне
скоупа контура). Все замеры выполнены на **локальном снимке БД** в контейнере
`processmap_v1-postgres-1` (БД `processmap`, пользователь `fpc`): 1789 сессий,
578 org_id, 748 project_id, данные до 2026-09-15. Это deviation от брифа
(ожидались прямые SELECT к prod), зафиксированная аудитором. **Все выводы ниже
даются как «на снимке» и не претендуют на полноту prod-распределения.**

Повторяемость снимка: все запросы — SELECT-only, детерминированные агрегаты.

---

## 1. Инвентарь process_layer и пары AS IS↔TO BE

### 1.1 Распределение process_layer (живые / удалённые)

```sql
SELECT process_layer, deleted_at>0 AS is_deleted, COUNT(*)
FROM sessions GROUP BY 1,2 ORDER BY 1,2;
```

| process_layer | удалённые (deleted_at>0) | живые (deleted_at=0) | всего |
|---|---|---|---|
| as_is | 1 | 1786 | 1787 |
| to_be | 0 | 2 | 2 |
| (пусто/NULL) | 0 | 0 | 0 |

- Всего сессий: 1789 (живых 1788). Пустых/прочих значений process_layer нет — ось дихотомическая.
- Доля удалённых: as_is — 1/1787 = **0,056%**, to_be — **0%**.
- mode среди живых: as_is — 956 с пустым mode + 830 `quick_skeleton`; обе to_be — `quick_skeleton` (обе созданы 2026-08-17, одна org_id = `org_default`, обе в project `d7d6689637`).
- bpmn_xml: у обеих to_be — **пустая строка** (length=0), activity_count=0. Для контекста: у as_is пустой bpmn_xml у 896 из 1786 (50,2%), непустой у 890.
- parent_session_id непустой у 160 сессий (все as_is, 159 живых + 1 удалённая) — это subprocess-деревья, не пары TO BE.

### 1.2 Пары AS IS↔TO BE — два метода

**Метод A (derived_from_session_id <> '')** — единственный дающий пары:

```sql
SELECT t.id, t.title, a.id AS as_is_id, a.title
FROM sessions t JOIN sessions a ON a.id=t.derived_from_session_id
WHERE t.process_layer='to_be';
```

| to_be id | to_be title | as_is id | as_is title |
|---|---|---|---|
| 34ddc5a40f | TO BE overlay test | b01bb10549 | phase5 llm3 |
| edbeb21c98 | TO BE from empty | cee3891a54 | empty AS IS |

**Пар: 2.** Обе to_be — root (parent_session_id пуст), обе ссылаются на живых as_is
в том же project_id (`d7d6689637`) и org_id (`org_default`).

**Метод B (name-based)** — совпадение title/mode/project_id после снятия TO BE-префикса:

```sql
SELECT COUNT(*) FROM sessions t
WHERE t.process_layer='to_be' AND t.deleted_at=0 AND EXISTS (
  SELECT 1 FROM sessions a WHERE a.process_layer='as_is' AND a.deleted_at=0
    AND a.project_id=t.project_id AND a.mode IS NOT DISTINCT FROM t.mode
    AND lower(a.title)=lower(t.title));
-- результат: 0
```

**Пересечение методов: 0 пар.** Названия to_be («TO BE overlay test»,
«TO BE from empty») не совпадают с названиями родительских as_is («phase5 llm3»,
«empty AS IS») — пользователи не копируют имя AS IS в TO BE. Вывод: name-based
сопоставление на снимке бесполезно, единственный рабочий канал пары —
`derived_from_session_id`.

### 1.3 Сироты

```sql
SELECT t.id, EXISTS(SELECT 1 FROM sessions a WHERE a.id=t.derived_from_session_id) AS parent_exists,
       (SELECT a.deleted_at FROM sessions a WHERE a.id=t.derived_from_session_id) AS parent_deleted
FROM sessions t WHERE t.process_layer='to_be';
```

- to_be с derived_from на несуществующий/удалённый id: **0** (оба родителя живы, deleted_at=0).
- as_is, на которые ссылаются удалённые to_be: **0** (удалённых to_be нет в принципе).

---

## 2. Рассинхрон версий в парах

Пар всего 2 (<10) — полный список:

```sql
SELECT t.id to_be_id, t.version to_be_ver, t.updated_at to_be_upd,
       a.id as_is_id, a.version as_is_ver, a.updated_at as_is_upd,
       (t.updated_at - a.updated_at)/86400.0 AS upd_diff_days,
       a.updated_at > t.updated_at AS as_is_newer
FROM sessions t JOIN sessions a ON a.id=t.derived_from_session_id
WHERE t.process_layer='to_be' AND t.deleted_at=0;
```

| пара | to_be ver/upd | as_is ver/upd | Δupd, дней | as_is новее? |
|---|---|---|---|---|
| 34ddc5a40f ← b01bb10549 | 2 / 2026-08-17 | 3 / 2026-08-17 | −0,011 (−941 сек) | **да** |
| edbeb21c98 ← cee3891a54 | 2 / 2026-08-17 | 2 / 2026-08-17 | 0,000 | нет (равны) |

- p50 разницы updated_at: 0 дней; p95: −0,011 дня. Выборка микроскопическая — статистика не репрезентативна.
- AS IS новее TO BE: **1 из 2 пар (50%)**. Признак «TO BE отстаёт от AS IS» существует
  в данных, но при 2 парах это наблюдение, а не закономерность.
- version: у пары 1 as_is v3 vs to_be v2 (to_be создана из более ранней ревизии? нет —
  оба updated в один день; version-разница +1 у as_is).

---

## 3. interview_json->stage vs process_layer

```sql
SELECT process_layer, interview_json::jsonb->>'stage' AS stage, COUNT(*)
FROM sessions
WHERE deleted_at=0 AND interview_json IS NOT NULL AND interview_json NOT IN ('','{}')
GROUP BY 1,2;
```

| process_layer | stage | count |
|---|---|---|
| as_is | (NULL — ключа нет) | 174 |

- Живых сессий с непустым interview_json: **174 из 1788 (9,7%)**; остальные 1614 — NULL/''/'{}'.
- Ключ `stage` в interview_json отсутствует **во всех 174** записях.
- Перекрёстка stage × process_layer построить нельзя: ось interview.stage на снимке
  полностью дегенеративна (всегда NULL).
- **Дублирования осей нет** — но и нагрузки нет: process_layer — единственная
  реально используемая стадийная ось. Ось interview.stage фактически мертва
  (данные её не заполняют; см. §5 — код её всё ещё экспортирует в explorer-ответ).

EVIDENCE GAP: если prod-распределение interview_json отличается (на снимке всего 9,7%
сессий с непустым interview_json), вывод о мёртвости оси stage может не переноситься
на prod — снятие с прямого prod-SELECT невозможно в этом окружении.

---

## 4. Provenance TO BE

- to_be всего: 2 (живых). Обе с `derived_from_session_id <> ''` → **100% to_be на снимке
  имеют колоночный provenance** (ссылка на as_is-источник).
- Ручных to_be (derived_from=''): **0**.

```sql
SELECT id, bpmn_meta_json FROM sessions WHERE process_layer='to_be';
-- обе записи: bpmn_meta_json = '{}'
```

- Следов трансформации в bpmn_meta_json: **0**. Ключи типа transform/derived/provenance
  отсутствуют в meta ВООБЩЕ по всем живым сессиям:

```sql
SELECT keys AS meta_key, COUNT(*) FROM (
  SELECT jsonb_object_keys(bpmn_meta_json::jsonb) AS keys FROM sessions
  WHERE deleted_at=0 AND bpmn_meta_json NOT IN ('','{}')
) t WHERE keys ILIKE '%transform%' OR keys ILIKE '%provenance%' OR keys ILIKE '%derived%'
GROUP BY 1;
-- результат: 0 строк
```

  (Подстроки 'transform'/'derived' встречаются в 946 meta-значениях, но только внутри
  значений `hybrid_v2.layers[]` и flow_meta — не как provenance-ключи.)

- Следов в bpmn_xml: **0** (`bpmn_xml ILIKE '%transform%'` → 0 по всем живым; у самих
  to_be bpmn_xml пустой).

**Вывод для стратегии provenance-first:** на снимке provenance to_be существует ТОЛЬКО
на уровне колонки `derived_from_session_id`. Ни XML, ни meta не несут ни самой модели,
 ни следа трансформации (обе to_be — пустые каркасы: пустой bpmn_xml, activity_count=0,
created и updated в один день — похоже на тестовые/демо-записи, а не реальные трансформации).
Охват provenance-first по данным снимка: 2/2 (100%) колоночно, 0/2 (0%) по контенту.
Критично: при масштабировании to_be (их доля 0,11% сессий) контент-протухание
(bpmn_xml пустой) делает provenance единственным носителем связи — и одновременно
единой точкой отказа (сирота = потеря связи, см. §1.3: механизма самовосстановления
в данных нет).

---

## 5. Сверка с кодом: rollup/counters в canvas_session repository

Файл: `backend/app/domains/storage/canvas_session/repository.py` (1287 строк).
Бриф указывал строки 266–712 — актуальные номера совпадают по смыслу:
`_session_to_explorer_dict` — :251-277 (process_layer :266, interview.stage :265),
`_tobe_leaf_overview` — :280-295, `_load_tobe_links` — :298-328,
rollup-цикл — :653-719 (rollup-функция :704-716, фильтр stage :731-737).

Что реально делает код:

1. **Канон пары — только derived_from_session_id** (`_load_tobe_links`, :298-328):
   выбираются живые root-to_be (`process_layer='to_be'`, `deleted_at=0`,
   `COALESCE(parent_session_id,'')=''`) в рамках project_id+org_id, строится карта
   `derived_from_session_id → MAX(updated_at)`. Name-based сопоставления в коде нет —
   согласуется с данными (метод B дал 0 пар).
2. **Leaf-логика** (`_tobe_leaf_overview`, :280-295): любой to_be-узел считается
   `to_be=1, as_is=0` независимо от наличия derived_from; as_is-узел с живой связью
   считается `as_is=1, to_be=1` (двойной бейдж), без связи — `to_be=0`.
3. **Rollup** (:704-716): суммирование counters по поддереву parent_session_id,
   `tobe.last_updated_at = MAX` по поддереву; stage_badges из сумм.
4. **Серверный фильтр `stage`** (:731-737): параметр `stage=as_is|to_be` маппится
   на process_layer, НЕ на interview.stage. При этом `_session_to_explorer_dict`
   (:265) отдаёт в ответ `stage = interview.stage` — который в данных всегда пустой.
   Два разных «stage» в одном контракте: фильтр — process_layer, поле ответа — мёртвый
   interview.stage.

### Расхождения данных и rollup-логики

1. **Совпадает:** обе to_be на снимке — root с непустым derived_from в том же
   project/org → попадают в `_load_tobe_links` → оба as_is-родителя получат двойной
   бейдж. Ожидания rollup подтверждены данными снимка.
2. **Расхождение (логическое):** rollup считает связь «живая to_be → as_is» по
   `MAX(updated_at)` самой to_be, но **не проверяет, не новее ли as_is** (§2: в 1 из 2
   пар as_is обновлен на 941 сек позже to_be). Бейдж «TO BE актуальна» по коду
   эквивалентен «существует», а не «синхронна» — рассинхрон версий в UI не виден.
3. **Расхождение (потенциальное):** `_load_tobe_links` фильтрует root-to_be; to_be с
   непустым parent_session_id (subprocess-to_be) в карту не попадут и их as_is-родители
   не получат бейдж. На снимке таких нет (0 to_be с parent), но миграция
   `010_sessions_process_layer.py` (см. ACTIVE TASKS.md) оставляет 47 веток дрейфа —
   регрессия возможна при появлении subprocess-to_be.
4. **Расхождение (контрактное):** поле `stage` в explorer-ответе (interview.stage)
   всегда пустое в данных, а фильтр `stage` работает по process_layer — клиент,
   читающий поле `stage` для отображения стадии, всегда получит ''. **EVIDENCE для
   рекомендации:** либо заполнять interview.stage, либо отдавать process_layer
   как источник стадии, либо убрать мёртвое поле из контракта.

---

## Итоговые числа (снимок 2026-09-15)

| Метрика | Значение |
|---|---|
| Всего сессий / живых | 1789 / 1788 |
| as_is живых / удалённых | 1786 / 1 |
| to_be живых / удалённых | 2 / 0 |
| Пары по derived_from (оба метода пересечение) | 2 (name-based: 0) |
| Сироты | 0 |
| Пары, где as_is новее to_be | 1 из 2 (50%) |
| interview.stage непустых | 0 из 174 непустых interview_json |
| to_be с колоночным provenance | 2/2 (100%) |
| to_be с provenance в bpmn_meta_xml | 0/2 (0%; ключей transform/provenance/derived нет нигде) |
| to_be с непустым bpmn_xml | 0/2 |

## Источники контекста (Obsidian)

- `server-backup/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/workspace-as-is-tobe-overview/EXEC_REPORT.md` — контур overview AS IS/TO BE (2026-09-11): подтверждает, что rollup-метрики реализованы в `domains/storage/canvas_session/repository.py` поверх process_layer/derived_from_session_id; ровно тот код, что сверен в §5.
- `server-backup/srv/obsidian/obsidian-vault/PROCESSMAP/Прочее/ACTIVE TASKS.md:199` — 47 веток с дрейфом миграции `010_sessions_process_layer.py` (риск рассинхрона схемы process_layer между ветками).
- EPIC BOARD (obsidian-vault) — активные эпики E08/E09 не пересекаются со стадийной моделью; релевантных открытых задач по TO BE-стадиям не найдено.

## Ограничения

- Все выводы — на локальном снимке БД от 2026-09-15 (DB-plane substitution, см. §0).
  Прода-распределение (1789 сессий на снимке — это не прод) может отличаться, особенно
  по to_be (на снимке их 2, вероятно тестовые).
- 2 пары — недостаточная выборка для p50/p95-выводов; статистика §2 носит иллюстративный характер.
