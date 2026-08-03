# FIX-V — диагностика блока 1 (V1: «Создание версии: рассинхрон метаданных + конфликт 409»)

Дата: 2026-08-03. Ветка: `fix/version-save-ux` (worktree `/root/pm-e3/worktrees/fix-v`, от `origin/main` b9745482).

## Корень (подтверждён чтением кода)

Цепочка `runManualSaveAction({ createRevision: true })` (ProcessStage.jsx:2405) при «Создать версию BPMN»:

1. `cancelPendingDiagramAutosave()` (2409) — autosave не конкурирует (гипотеза H3 закрыта без правок).
2. `bpmnSync.flushFromActiveTab` → PUT /bpmn (`persistReason="publish_manual_save"`) → 200, backend создаёт снапшот версии, `diagram_state_version` (dsv) растёт.
3. Tracked-base синкается ДО любых компаньон-записей: `companionBaseDiagramStateVersion = max(saved.dsv, snapshot.dsv, tracked)` → `rememberDiagramStateVersion(...)` (ProcessStage.jsx:2456–2460). **Гипотеза H1 (stale tracked-base) для этого пути закрыта** — `resolveSessionPatchBaseAtSendTime` берёт свежий tracker.
4. **Projection sync** (2542–2607): `buildManualSaveProjectionSyncPlan` строил patch с `interview + nodes + edges` → `enqueueSessionPatchCasWrite` → PATCH /api/sessions/{sid}.
   - До FIX-SAVE B5 backend молча дропал nodes/edges для XML-сессий (200, no-op).
   - **После B5** (`_reject_draft_graph_write_on_xml_session`, `_legacy_main.py:914`) → **409 `DRAFT_GRAPH_READ_ONLY_XML_TRUTH`** — штатный, ожидаемый PATCH стал «конфликтом».
5. Этот 409 → `companionError` → `resolveManualSaveOutcomeUi` (manualSaveOutcomeUi.js:57) → тост **«Метаданные версии пока не синхронизированы»** — жалоба №1. Это ложный негатив: первичное сохранение и версия прошли успешно.
6. Дополнительно тот же 409 мог армировать conflict-gate saveCoordinator (P1) → следующий save показывал конфликт-модал — жалоба «конфликт 409 после версии».

**Вывод: регрессия собственного трека FIX-SAVE B (P6).** Гард B5 НЕ откатываем (он ловит реальные грязные записи); фронт обязан не слать nodes/edges для XML-truth сессий — сервер их всё равно никогда не персистил (подтверждено аудитом P6: nodes_json остаётся пустым у XML-сессий).

## Фикс (блок 1)

1. **`manualSaveProjectionSync.js`**: план всегда строится по непустому XML ⇒ сессия XML-truth ⇒ из серверного `patch` удаляются `nodes`/`edges` (локальные `nextNodes`/`nextEdges` сохранены). Возвращаются флаги `interviewChanged/nodesChanged/edgesChanged`.
2. **`ProcessStage.jsx:2566–2568`**: условия локального `onSessionSyncWithVersion` переведены с ключей patch на флаги `nodesChanged/edgesChanged` — локальное React-состояние обновляется ровно как раньше; на сервер уходит только `interview` (если изменилось). Если patch пуст — PATCH не отправляется вовсе (меньше записей).
3. **`App.jsx setElementStepTime`** (тот же класс регрессии B5, user-facing): редактор «Время шага» слал `{nodes, interview?}` в PATCH /sessions → 409 для XML-сессий. Теперь для XML-truth сессий payload = только `interview` (время шага живёт в `interview.steps`); если менять нечего — локальный `ok` без запроса.

Tracked-base после версии (V2) и гонка с autosave (V4) — уже корректны (пп. 1, 3 выше), правок не потребовали.

## Прочие пути PATCH/PUT /sessions (проверены, без правок)

- `App.jsx`: notes_by_element (×3), interview (analysis), title — без nodes/edges. OK.
- `interviewAnalysisPatchHelper.js` — только `interview.analysis`. OK.
- `WorkspaceExplorer.jsx` — title/мета. OK.
- `useDraft.js patchDraft` — шлёт whole-draft (nodes/edges), но только для draft-сессий без `bpmn_xml` (гард не срабатывает). Оставлено как есть; если появится сценарий «draft с XML» — отдельный трек.

## Тесты

- Обновлены/добавлены: `manualSaveProjectionSync.test.mjs` — регрессионный тест FIX-V: patch не содержит nodes/edges при изменении графа; interview сохраняется в patch; локальная проекция (nextNodes) нетронута.
- Фронт-сьют: 2710/2644/**62 fail** = baseline b9745482 (новых падений нет).
- Build: OK.

## Осталось по блоку 1

- Stage-воспроизведение V1 на sandbox `5ae321f04f` (создать версию → save → проверить отсутствие 409/тоста) — мутация, **с подтверждением владельца**. Скрипт: `scripts/fix-v/version_save_check.mjs` (фаза B при `MUTATE=1`), прогон полноценный после деплоя фикса на stage; до деплоя фаза B демонстрирует баг (evidence «до»).

---

# Блок 2 (U1/U2): тосты

## Диагностика

- `ProcessSaveAckToast` позиционировался ВЕРТИКАЛЬНО ПО ЦЕНТРУ якоря тулбара (`top = anchor.top + (h−toast)/2 + 8`) с шириной 360px влево от якоря → карточка с `pointer-events-auto` перекрывала кнопки тулбара (undo/redo/save/«Создать версию») и блокировала клики на 4–8с.
- `HybridPersistToast` — отдельный fixed bottom-right z-120, `pointer-events-auto` всей плашкой → перекрывал канвас-контролы; жил отдельно от ack-тоста (одновременный показ = два тоста в разных углах).
- Авто-скрытие успеха уже соответствовало спеке: 4000мс (SAVE_ACK_TOAST_HIDE_MS, залочено тестом).

## Фикс

1. **`ProcessToastViewport.jsx` (новый)** — единый контейнер: fixed ПОД тулбаром (`top = anchor.bottom + 8`), правым краем к якорю, `pointer-events-none`, вертикальный стек `flex-col gap-2`, z-130. Якорь — общий хук `useDiagramToolbarAnchorRect.js` (header notification anchor → правый слот → action bar; resize/scroll).
2. **`ProcessSaveAckToast`** — новый проп `layout="stack"` (in-flow карточка в стеке; self-positioning выключен). Дефолтный режим НЕ изменён (source-contract тест залочен и проходит).
3. **`HybridPersistToast`** — `layout="stack"` + pointer-events-гигиена (контейнер none, события только у карточки) в обоих режимах.
4. **`ProcessStage`** — оба тоста рендерятся в одном viewport на уровне shell → стек без перекрытий, единая позиция под тулбаром, контролы не перекрыты и кликабельны.
5. Plumbing тоста из `ProcessDiagramOverlayLayers`/`buildProcessDiagramOverlayLayersProps`/`useStableProcessDiagramOverlayLayersProps` (HYBRID_TOAST_KEYS) удалён.

Тесты: `ProcessToastViewport.test.mjs` (4: контракт viewport/stack-режимов + резолвер якоря с fallback-цепочкой). Фронт-сьют 2714/2648/62 = baseline.

---

# Блок 3 (L1–L3): индикатор загрузки канваса

## Диагностика

- Инфраструктура состояний уже была: `useDiagramLoadStateMachine` (idle→initializing→importing→ready) + `DiagramLoadBoundary` + `DiagramSkeleton` + `FlowArcSpinner`.
- **Проблемы**: (1) у классов `diagramSkeleton*` НЕ БЫЛО CSS — «скелетон» сводился к одному спиннеру; (2) показ мгновенный → мерцание на быстрых загрузках; (3) блокировка pointer-events канваса сразу, даже на мгновенных загрузках.

## Фикс

1. **`DiagramSkeleton.css` (новый)** — реальный скелетон: placeholder-«канвас» с shimmer-пульсом и блоками-узлами, подпись «Загружаем схему…». Анимации ТОЛЬКО transform/opacity (`will-change`, reduced-motion, dark-тема через токены `--c-bg`/`--c-text-muted`) — без влияния на FPS.
2. **`DiagramLoadBoundary`** — порог анти-мерцания `SKELETON_REVEAL_DELAY_MS = 400`: скелетон появляется только если загрузка длится >400мс; скрытие мгновенное; pointer-events канваса блокируются только при видимом скелетоне.

Тесты: `DiagramLoadBoundary.test.mjs` (5: timing 0/460мс/скрытие, fast-load без скелетона, CSS-контракт). Фронт-сьют 2717/2651/62 = baseline.

---

# Stage-прогон

Скрипт `scripts/fix-v/version_save_check.mjs`:
- Фаза A (read-only): открытие sandbox-сессии, тайминги скелетона, toast-viewport pointer-events.
- Фаза B (`MUTATE=1`, **с подтверждением владельца**): микро-правка через modeler API → «Создать версию BPMN» → контроль отсутствия тоста рассинхрона/409/конфликт-модала → save → скрины + `fixv_report.json`, EXIT=0 при PASS.
- До деплоя фикса фаза B воспроизводит баг (evidence «до»); после деплоя — приёмка.
