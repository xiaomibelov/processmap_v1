# KEY_COVERAGE_MATRIX — audit/tobe-diff-keys-v1

**Дата:** 2026-09-16. **Источник:** локальный снимок БД `processmap` (docker `processmap_v1-postgres-1`), 1789 сессий, данные до 2026-09-15. DB-plane substitution: прямого доступа к prod-БД нет (SSH вне скоупа), замеры выполнены на локальном снапшоте вместо прямых SELECT к prod.

## 1. Методика выборки

- Популяция: живые сессии (`deleted_at = 0`) с непустым `bpmn_xml` — **890 шт.** из 1789.
- Стратификация: до 2 сессий на пару (org_id, project_id), приоритет — с `bpmn_xml LIKE '%zeebe:properties%'`, затем по свежести `updated_at`.
- Итог: **60 схем** (требование ≥50 выполнено), **54 разных project_id**, 6 org_id (54× `org_default` + 5 одно-сессионных org — таково реальное распределение снимка: 884 из 890 непустых XML живут в `org_default`).
- Парсинг: python3 + ElementTree на хосте, XML выгружены через `psql -tA` в /tmp.
- Типы элементов: task (все подвиды), gateway (все), event (все), sequenceFlow. Диаграммные элементы (BPMNShape/Edge) не считаются.

## 2. Агрегированная статистика

| Метрика | Значение |
|---|---|
| Всего схем в выборке | 60 (0 ошибок парсинга XML) |
| Схемы с zeebe:properties | **15 / 60 (25%)** |
| Среднее покрытие properties по всем 60 | 8.3% элементов |
| Среднее покрытие по подвыборке с properties | 33.3% элементов (max 45.1%) |
| Именованные task | 96.1% |
| Именованные gateway | 96.1% |
| Именованные event | 70.8% |
| ID вида Activity_/Event_/Gateway_/Flow_ | 72% (7674 generated / 2942 semantic) |
| Схемы, редактировавшиеся после создания | 42 / 60 (70%) |
| Медиана размера XML | 55.1 КБ (max 774.8 КБ) |
| Медиана числа элементов | 97 |

Глобальная сверка популяции (SQL по всем 890 живым непустым):
`zeebe:properties` — 163 (18.3%), любые `extensionElements` — 191 (21.5%), `pm:RobotMeta` — 7, непустой XML — 890.

## 3. Словарь ключей zeebe:properties (топ-20 по выборке)

| # | Ключ | Частота | Класс |
|---|------|--------:|-------|
| 1 | ingredient | 616 | доменный (пищевое производство) |
| 2 | container_tara | 607 | доменный |
| 3 | equipment | 441 | доменный |
| 4 | ingredient_value | 301 | доменный |
| 5 | container_tara_value | 219 | доменный |
| 6 | ingredient_um | 210 | доменный (ед. измерения) |
| 7 | tara | 207 | доменный |
| 8 | equipment_temperature | 149 | доменный |
| 9 | ee_time | 136 | доменный (equipment execution) |
| 10 | ee_operation | 132 | доменный |
| 11 | ingredient_temperature | 97 | доменный |
| 12 | equipment_work | 96 | доменный |
| 13 | ingredient_consistency | 54 | доменный |
| 14 | container_pack | 52 | доменный |
| 15 | equipment_mode | 38 | доменный |
| 16 | equipment_accessory | 27 | доменный |
| 17 | tara_marker | 26 | доменный |
| 18 | tara_marker_value | 26 | доменный |
| 19 | document | 25 | доменный |
| 20 | value | 24 | доменный |

**Вывод по ключам:** словарь ПОЛНОСТЬЮ доменный (ingredient/equipment/container/tara — предметка Food Process Copilot). Системных ключей типа `operation_code`/`robot_id`/`params` в живых данных выборки нет — traceability/производственная семантика кодируется именно доменными ключами. Случайные/тестовые ключи встречаются единично (`ууу`, `ggg` — сессия f5e1a2725d; `priority` — на уровне collaboration в E2E-фикстурах).

## 4. Матрица (60 схем)

Полная таблица: `matrix_table.md` (этот каталог) и `matrix.csv` (machine-readable, все поля включая xml_kb).

| # | session_id | org | project | title | elems | %props | named task/gate/evt % | id gen/sem | правки | ключи properties (топ) |
|---|-----------|-----|---------|-------|------:|-------:|----------------------|-----------|--------|------------------------|
| 1 | 7e00ebc150 | org_default | — | Добавить ингредиент | 9 | 33.3 | 100.0/—/0.0 | 9/0 | — | ingredient:3;equipment:2;ingredient_um:1;ingredient_value:1;container_tara:1 |
| 2 | dcf62aba82 | org_default | — | measure session 1 | 974 | 45.1 | 97.5/74.1/22.8 | 973/1 | ✓ | ingredient:184;container_tara:183;equipment:130;ingredient_value:91;container_ta |
| 3 | 8369840fea | org_default | 31c4aec70b | Налить ингредиент | 28 | 53.6 | 100.0/60.0/0.0 | 28/0 | ✓ | ingredient_value:8;ingredient_um:8;ingredient:4;equipment:3;container_tara_value |
| 4 | 1e078c71a0 | org_default | 31c4aec70b | measure session 2 | 974 | 45.1 | 97.5/74.1/22.8 | 973/1 | ✓ | ingredient:184;container_tara:183;equipment:130;ingredient_value:91;container_ta |
| 5 | b608a00d1d | org_default | 4204e4701b | Добавить ингредиент | 9 | 33.3 | 100.0/—/0.0 | 9/0 | ✓ | ingredient:3;ee_time:3;ee_operation:3;container_tara:2;ingredient_value:1;ingred |
| 6 | 497f4ab7d9 | org_default | 4204e4701b | diag | 137 | 32.8 | 60.4/100.0/20.0 | 136/1 | ✓ | ee_time:31;ee_operation:30;container_tara:12;ingredient:12;tara:11;equipment:10 |
| 7 | adc84cc764 | org_default | 445ebd4841 | E2E save session 17891605459 | 262 | 0.0 | 100.0/100.0/100.0 | 150/112 | ✓ |  |
| 8 | f3948ed8dd | org_default | 45b465c05f | E2E save session 17891605706 | 262 | 0.0 | 100.0/100.0/100.0 | 150/112 | ✓ |  |
| 9 | 162adb73f8 | org_default | 5d08a80d18 | overlay-desync-fixture | 5 | 20.0 | 100.0/—/0.0 | 2/3 | ✓ | ee_operation:1;ee_time:1;equipment:1 |
| 10 | bc59b66816 | org_default | 94afe6fc3c | E2E save session 17890984707 | 261 | 0.0 | 100.0/100.0/100.0 | 149/112 | ✓ |  |
| 11 | e1925a5b74 | org_default | 9db6144ae2 | E2E save session 17891002526 | 261 | 0.0 | 100.0/100.0/100.0 | 149/112 | ✓ |  |
| 12 | 53006f5546 | org_default | b1c8a56b6e | 123 | 160 | 31.2 | 56.9/100.0/20.0 | 159/1 | ✓ | ee_time:36;ee_operation:35;container_tara:14;tara:14;ingredient:12;equipment:11 |
| 13 | ca36d5cb15 | org_default | b1c8a56b6e | вывыв | 97 | 46.4 | 97.0/100.0/20.0 | 96/1 | ✓ | ee_time:31;ee_operation:30;ingredient:12;container_tara:12;tara:11;equipment:10 |
| 14 | d138c5a9ae | org_default | c2afdb98c2 | Добавить ингредиент | 9 | 33.3 | 100.0/—/0.0 | 9/0 | ✓ | ingredient:3;equipment:2;ingredient_um:1;ingredient_value:1;container_tara:1 |
| 15 | 25c158aace | org_default | c2afdb98c2 | Меренга_пирожное_ШУ - клон д | 974 | 45.1 | 97.5/74.1/22.8 | 973/1 | ✓ | ingredient:184;container_tara:183;equipment:130;ingredient_value:91;container_ta |
| 16 | 6a31dbe457 | org_default | d2b90bcbed | prop-speed | 137 | 32.8 | 60.4/100.0/20.0 | 136/1 | ✓ | ee_time:31;ee_operation:30;container_tara:12;ingredient:12;tara:11;equipment:10 |
| 17 | 6f24f8170f | org_default | d2b90bcbed | Переместить в емкость | 9 | 33.3 | 100.0/—/0.0 | 9/0 | ✓ | ingredient:3;ee_time:3;ee_operation:3;container_tara:2;ingredient_value:1;ingred |
| 18 | 707564e262 | org_default | d92925aa2f | Target Session | 14 | 7.1 | 100.0/100.0/100.0 | 4/10 | ✓ | container_condition:1 |
| 19 | 647655cc4d | org_default | e53f57af22 | E2E save session 17890945360 | 261 | 0.0 | 100.0/100.0/100.0 | 149/112 | ✓ |  |
| 20 | 0291eceea0 | org_default | e74e08e1ce | Source Session | 13 | 7.7 | 100.0/100.0/100.0 | 3/10 | ✓ | container_condition:1 |
| 21 | 8d8e2957bf | 1507f99910a4 | a41e114616 | Overlay session | 5 | 0.0 | 100.0/—/100.0 | 2/3 | — |  |
| 22 | 5e91679ca3 | 58102a308f66 | c070004d88 | Overlay session | 5 | 0.0 | 100.0/—/100.0 | 2/3 | — |  |
| 23 | 59d1404920 | 7179de4119a2 | b2ae5bf132 | Overlay session | 5 | 0.0 | 100.0/—/100.0 | 2/3 | — |  |
| 24 | cbb27857f6 | baf439e90e4b | 65119e9ade | Overlay session | 5 | 0.0 | 100.0/—/100.0 | 2/3 | — |  |
| 25 | 7b11e545a9 | cf83eb14eb2f | 2115529659 | Overlay session | 5 | 0.0 | 100.0/—/100.0 | 2/3 | — |  |
| 26 | c2cf05d499 | ed4374a80e33 | 0a12a11781 | Overlay session | 5 | 0.0 | 100.0/—/100.0 | 2/3 | — |  |
| 27 | e0a0fa1dce | org_default | 0004e8097d | E2E save session 17891004301 | 262 | 0.0 | 100.0/100.0/100.0 | 150/112 | ✓ |  |
| 28 | 64d1ce372c | org_default | 0118683617 | E2E save session d3t2_178943 | 316 | 0.0 | 100.0/100.0/100.0 | 180/136 | ✓ |  |
| 29 | 2880dea822 | org_default | 01d115912b | E2E save session dbg4_178943 | 317 | 0.0 | 99.2/100.0/100.0 | 181/136 | ✓ |  |
| 30 | 4ca5abe42d | org_default | 02a7a2206e | E2E save session 17890945967 | 262 | 0.0 | 100.0/100.0/100.0 | 150/112 | ✓ |  |
| 31 | 62cdf6f667 | org_default | 02f0d8da7e | E2E save session 17890544764 | 244 | 0.0 | 100.0/100.0/100.0 | 136/108 | — |  |
| 32 | 74476470c0 | org_default | 03e624f451 | E2E save session 17891002757 | 261 | 0.0 | 100.0/100.0/100.0 | 149/112 | ✓ |  |
| 33 | 3b36b26df7 | org_default | 047edfc0bb | E2E save session 17894272913 | 316 | 0.0 | 100.0/100.0/100.0 | 180/136 | ✓ |  |
| 34 | 250a6ddbdf | org_default | 0489c791b2 | E2E pending edits session 17 | 5 | 0.0 | 100.0/—/100.0 | 2/3 | — |  |
| 35 | 96c00f9de5 | org_default | 058003f7b1 | E2E save session 17894330867 | 316 | 0.0 | 100.0/100.0/100.0 | 180/136 | ✓ |  |
| 36 | 52ae5ecef5 | org_default | 061c7cae77 | E2E save session 17890471663 | 5 | 0.0 | 100.0/—/100.0 | 2/3 | ✓ |  |
| 37 | 2547ad2bf7 | org_default | 06267eb644 | E2E polling session 17891598 | 422 | 0.0 | 100.0/—/0.0 | 280/142 | — |  |
| 38 | 3e5b05c582 | org_default | 06a1b26961 | E2E compare ui session singl | 5 | 0.0 | 100.0/—/100.0 | 3/2 | — |  |
| 39 | ecfdf0c14a | org_default | 06ad42ad8a | E2E save session dbg1_178942 | 316 | 0.0 | 100.0/100.0/100.0 | 180/136 | ✓ |  |
| 40 | 21dadc8a13 | org_default | 06c7b617df | E2E save session dbg2_178942 | 316 | 0.0 | 100.0/100.0/100.0 | 180/136 | ✓ |  |
| 41 | a57ecc9d61 | org_default | 06fedc20e3 | E2E save session 17890595920 | 260 | 0.0 | 100.0/100.0/100.0 | 148/112 | — |  |
| 42 | 691cbd95a1 | org_default | 0895c7b424 | E2E compare ui session shot2 | 7 | 0.0 | 100.0/—/100.0 | 5/2 | — |  |
| 43 | 01b45c11b5 | org_default | 08aa1b353c | E2E pending edits session 17 | 5 | 0.0 | 100.0/—/100.0 | 2/3 | — |  |
| 44 | b665007403 | org_default | 08b4b6be00 | E2E semantic diff session 17 | 7 | 0.0 | 100.0/—/100.0 | 3/4 | ✓ |  |
| 45 | b68e44ac18 | org_default | 08ddfed481 | E2E mixed versions session 1 | 5 | 0.0 | 100.0/—/100.0 | 3/2 | ✓ |  |
| 46 | 79138a5840 | org_default | 08f77a2a63 | E2E pending edits session 17 | 5 | 0.0 | 100.0/—/100.0 | 2/3 | ✓ |  |
| 47 | 66e85f059c | org_default | 091d7507be | E2E snapshot accumulate sess | 9 | 0.0 | 100.0/—/100.0 | 7/2 | ✓ |  |
| 48 | 0ff141ff54 | org_default | 0a4d37e0e3 | E2E compare ui session shot2 | 7 | 0.0 | 100.0/—/100.0 | 5/2 | — |  |
| 49 | fffb07adb4 | org_default | 0a54bdd628 | E2E polling session 17891532 | 422 | 0.0 | 100.0/—/0.0 | 280/142 | — |  |
| 50 | 755b2aa213 | org_default | 0a8365c32f | E2E pending edits session 17 | 5 | 0.0 | 100.0/—/100.0 | 2/3 | ✓ |  |
| 51 | 3baf94c0ea | org_default | 0aa9db104c | E2E save session dbg3_178943 | 319 | 0.0 | 98.5/100.0/100.0 | 183/136 | ✓ |  |
| 52 | 840c2ff66d | org_default | 0aedf120b8 | probe | 3 | 0.0 | 0.0/—/0.0 | 1/2 | ✓ |  |
| 53 | 8cdc35a764 | org_default | 0b091ff7d3 | E2E save session 17890634411 | 262 | 0.0 | 100.0/100.0/100.0 | 150/112 | ✓ |  |
| 54 | b255bfa808 | org_default | 0b5f72be8e | E2E save session 17891005393 | 261 | 0.0 | 100.0/100.0/100.0 | 149/112 | ✓ |  |
| 55 | 27ed22924e | org_default | 0b65a4a801 | E2E snapshot accumulate sess | 9 | 0.0 | 100.0/—/100.0 | 7/2 | ✓ |  |
| 56 | 6d189c3973 | org_default | 0b6f81eeb7 | E2E snapshot session 1789477 | 33 | 0.0 | 100.0/—/100.0 | 31/2 | ✓ |  |
| 57 | cea8194fe9 | org_default | 0c1c6a97cc | dbg2 sess 1789128572994 | 5 | 0.0 | 100.0/—/0.0 | 2/3 | — |  |
| 58 | 8545ad0205 | org_default | 0c69bc89f5 | E2E polling session 17891499 | 422 | 0.0 | 100.0/—/0.0 | 280/142 | ✓ |  |
| 59 | 38c7bbdf8d | org_default | 0c706c3fea | DBG7b | 5 | 0.0 | 100.0/—/0.0 | 3/2 | — |  |
| 60 | 38704e37e1 | org_default | 0c908bb085 | E2E save session 17894372654 | 316 | 0.0 | 100.0/100.0/100.0 | 180/136 | ✓ |  |

## 5. Наблюдения

1. **Двухрежимность контента:** схемы делятся на «производственные» (богатые доменными properties, 45%+ покрытия, до 974 элементов) и «скелетные/тестовые» (properties отсутствуют или единичны, имена часто дефолтные).
2. **ID семантические — редкость:** даже в доменных схемах 72% ID сгенерированные (Activity_xxx), семантические ID (n1, n2, Задача_1) — преимущественно в старых/ручных схемах. Сопоставление AS IS↔TO BE по ID неустойчиво → подтверждает provenance-first стратегию из брифа.
3. **Имена задач — надёжный якорь:** 96% именованных task/gateway; event'ы именованы хуже (71%), что соответствует BPMN-практике (start/end events без имён).
4. **Round-trip:** 70% схем редактировались после создания; у всех 15 «propertied»-схем properties целы после правок (подробности в AUDIT_REPORT.md §3).
