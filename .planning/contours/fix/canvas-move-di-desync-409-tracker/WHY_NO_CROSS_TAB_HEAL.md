# WHY_NO_CROSS_TAB_HEAL — почему cross-tab heal НЕ спас сессию 2ce69bd74c

Контур: fix/canvas-move-di-desync-409-tracker (S2, F5). Дата: 2026-09-21.
Источники: evidence/audit/canvas-move-di-desync-422 (f5-repro.mjs,
logs/f5-repro.jsonl), frontend/src/lib/crossTabVersionSync.js,
frontend/src/lib/casVersionTracker.js, saveCoordinator.js, createSaveOutbox.js.

## Механизм heal (как задумано)

`createCrossTabVersionSync` — активный канал (BroadcastChannel
`pm-cas-versions`, fallback storage-events). Adopt чужой версии происходит
только при ВХОДЯЩЕМ сообщении (`version` / `here` / `rollback`) от ДРУГОГО
clientId (`handleMessage` отсекает собственные сообщения,
crossTabVersionSync.js:131). Два жёстких условия adopt:

1. **Должен существовать второй publisher.** Свои собственные мутации трекера
   публикуются в канал, но обратно к себе не приходят (BroadcastChannel не
   доставляет сообщение отправителю; плюс явный фильтр clientId). Вкладка,
   которая ЕДИНСТВЕННАЯ держит сессию, физически не может получить heal —
   некому отправить сообщение.
2. **Adopt-on-clean.** Принимающая вкладка adopt'ит версию только если она
   clean (`isDirty() === false`, crossTabVersionSync.js:106-118). Dirty-вкладка
   получает лишь предупреждение и СОХРАНЯЕТ честную конфликт-семантику —
   by design, heal не лечит вкладку с несохранёнными правками.

## Живой evidence по 2ce69bd74c (f5-repro, 2026-09-20T23:57Z)

```
session-before:            diagram_state_version = 30
ops-label (drag)           → POST /operations 200, baseSent = null
after-class-c (full-PUT)   → PUT /bpmn 200, baseSent = 31
server_version_now = 33    → tracker отставал от сервера минимум на 2
VERDICT: put_409 = false, body409 = null   (409 НЕ воспроизвёлся у аудитора)
```

Что видно из записи:

- **Одиночная вкладка.** Воспроизведение шло из одного браузерного контекста;
  второго publisher'а сессии не существовало. Heal-приёмнику неоткуда получить
  сообщение — условие (1) не выполнено по построению.
- **Tracker лагал от сервера.** Full-PUT ушёл с base=31, тогда как сервер к
  моменту проверки был на 33. Инвариант «после собственного ops-ack
  tracked base == server version» был нарушен ещё до любого CAS-запроса
  класса C: ops-flush (версия 31→32 на сервере) не adopt'ился в трекер
  собственного пути — ровно статический F5-пробел аудита (createSaveOutbox.js
  писал ack-версию только в syncStateStore.lastServerVersion).
- **baseSent=null у ops-flush** — в момент отправки батча трекер вообще не имел
  версии (getBaseVersion → null): вкладка начинала мутации с пустой CAS-базы.
  Это вторичное следствие того же класса (инициализация tracked-base на
  раннем drag раньше сессионной активации), heal его тоже не лечит — heal
  лечит рассинхрон МЕЖДУ вкладками, а не отсутствие собственной базы.
- Cross-tab heal у аудитора «спасал» в других сценариях именно потому, что
  там была вторая вкладка: её публикация версии adopt'илась первой вкладкой
  adopt-on-clean. В 2ce69bd74c такого пира не было — механизм heal обнаружил
  бы и вылечил последствия, только если бы существовал.

## Вывод

Heal — пассивный межвкладочный механизм конвергенции. Он не заменяет
собственный adopt: «одна вкладка + собственные ops-мутации» — базовый сценарий
работы, и в нём трекер обязан обновляться из собственного ack. Именно это и
делает S2 (вариант A): `_onAck` adopt'ит ack-версию в casVersionTracker,
идемпотентно и с монотонным guard'ом.

## Нужен ли defense-in-depth вариант B?

Вариант B = resolveBase читает `syncState.lastServerVersion` как fallback при
отсутствии tracked-значения (второй источник правды).

Рекомендация: **не нужен как обязательный**. После S2 инвариант «own ack →
tracker == server version» закрыт в источнике; fallback-дублирование оставило
бы два живых источника базы с дрейф-риском (класс T3: «только saveCoordinator
бампит»). Вариант B оправдан только как реакция на live-evidence: если после
stage-деплоя S2 + soak окно повторится 409 с подтверждённым stale base_sent —
тогда рассмотреть B строго как fallback при пустом трекере (не max()-слияние),
отдельным approve владельца.
