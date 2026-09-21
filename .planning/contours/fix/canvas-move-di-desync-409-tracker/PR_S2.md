# PR — S2 (fix/canvas-move-di-desync-409-tracker)

**Срез:** S2 — F5: собственный ops-ack adopt'ит ack-версию в casVersionTracker
(вариант A по FIX_PLAN аудита).
**Ветка:** `fix/canvas-move-di-desync-409-tracker` (baseline `origin/main @
90556bae`, поверх S1 `abd2546b`).
**Статус:** готово к review. PUSH в origin НЕ выполнялся.

## Проблема

После серии ops-мутаций CAS-guarded пути (full-PUT класса C, meta PATCH) шли
со stale `base_diagram_state_version` → ложный 409 DIAGRAM_STATE_CONFLICT.
Собственный ops-ack версию писал только в syncStateStore
(`createSaveOutbox.js: _onAck`), casVersionTracker — CAS-база остальных
путей — не adopt'ился. Live-evidence (сессия 2ce69bd74c): PUT baseSent=31
при серверной версии 33.

## Изменение (минимальный дифф)

`createSaveOutbox.js`, `_onAck` — при ack с версией:

```js
const tracked = getTrackedDiagramStateVersion(sessionId);
if (tracked === null || ackVersion > tracked) {
  setTrackedDiagramStateVersion(sessionId, ackVersion);
}
```

- Идемпотентно: notify/cross-tab publish только при реальном изменении
  (casVersionTracker гарантирует) — повторный ack той же версии не дублирует
  публикацию в `pm-cas-versions`.
- Монотонный guard: stale-ack не downgrade'ит трекер после более нового adopt
  (409-rebase, чужой ops_committed, координаторный bump).
- syncStateStore остаётся внутренним трекером outbox; вариант B не
  реализован (отдельный approve).

## Почему cross-tab heal не спас — WHY_NO_CROSS_TAB_HEAL.md

Кратко: heal adopt'ит только входящие версии от ДРУГОЙ вкладки; одиночная
вкладка не имеет publisher'а — adopt физически невозможен. Adopt-on-clean
не лечит dirty-вкладку by design. Вариант B (fallback на
syncState.lastServerVersion) — не нужен как обязательный: два источника
правды = дрейф-риск T3-класса; допустим только по live-evidence после
stage-деплоя, строго fallback при пустом трекере.

## Тесты (RED подтверждён)

5 новых unit (createSaveOutbox.test.mjs, S2-блок): adopt по ack; идемпотентность
(1 публикация на 3 повтора); гонка ack vs более новый adopt (no downgrade,
0 лишних публикаций); ack без версии — no-op; штатный flush → tracker ==
ack-версия (инварт остальных путей не сломан). GREEN: файл 37/37, opsOutbox
+ snapshot 175/175, полный `npm test` — фейл-сет идентичен baseline
(pre-existing 26, hang saveBpmnState.property-pipeline).

## Риски

- Двойной adopt (координаторный bump на completeSuccess + S2-adopt): одно
  значение, повтор идемпотентен — тестами зафиксировано.
- Откат: revert одного коммита, поведение = main.

## Следующие срезы

S3 (модал 409: единый reader версий + clientBase + changed_keys) → S4 (F3
reconnect companion updateDi). Deploy/merge — только по approve владельца.
