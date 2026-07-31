# АУДИТ: пайплайн сохранений, дублирования и регрессии

Дата: 2026-07-31 · Аудитор: AI (только воспроизведение/чтение — код не менялся)
Stage: `stage.processmap.ru` commit `469e4ee9` (main, addendum-4) · Пользователь: technologist-demo
Скрипты-воспроизведения: `scripts/audit_save_api.mjs`, `scripts/audit_save_ui.mjs`, `scripts/audit_save_verify.mjs`
Доказательства: Network-логи (в evidence), скрины `docs/audit/*.png`, JSON `/tmp/audit_*_results.json`

## 0. Метод и ограничения

- **Stage-бэкенд — удалённый хост** (45.87.104.69): `docker logs` и прямой SQL к stage-БД **недоступны**.
  Компенсация: API-состояние (`GET /api/sessions/{id}`, `/bpmn?raw=1`, `/bpmn/versions`),
  Network-перехват статусов (200/409/423), UI-воспроизведение Playwright.
  Локальный docker на этой машине — это **prod** (env=prod, старый коммит): использован
  ТОЛЬКО для чтения схемы таблиц, ни одной записи.
- Деструктивные сценарии — на sandbox-сессии `5ae321f04f` («AUDIT save-pipeline sandbox»,
  копия XML супа; оставлена на stage как аудит-артефакт вместе с dup-probe сессиями).
- Сессия «Разогрев супа» (`13f1f10b20`) после аудита **возвращена к исходному XML**
  (бэкап до аудита, rev=11).

## 1. Карта пайплайна с точками сбоев

```
правка на канвасе (modeler, dirty)
   │  «Сохранить» (иконка B1) → PUT /api/sessions/{id}/bpmn (xml + base_rev)
   ▼
[A] Redis-lock pm:lock:session (TTL 15с) → 423 при занятости; ⚠ bypass при outage Redis
[B] CAS: base_rev vs sessions.diagram_state_version → 409 DIAGRAM_STATE_CONFLICT
   │  ⚠ проверка in-memory; save = upsert ВСЕЙ строки БЕЗ WHERE rev (Storage.save)
   ▼
[C] bpmn_versions snapshot (user-facing действия) — ⚠ ОТДЕЛЬНАЯ транзакция, MAX+1
   │
   ▼  Rev+1 (in-memory), session_state_versions (тут транзакция едина)
[D] инвалидация кэшей (post-commit, ⚠ ошибки глотаются; overlay не на всех путях)
   │
   ├─→ read-paths: GET /sessions, /bpmn?raw (TTL 60с), /meta (TTL 60с), projection (30с)
   ├─→ ⚠ GET /bpmn?raw может ПИСАТЬ (export_regenerate persist, без lock/CAS)
   ▼
[E] «Создать версию BPMN» = тот же PUT /bpmn (source_action=publish_manual_save) → V+1
[F] Публикация: PATCH /status=ready → git-mirror (3× patch interview_json подряд ⚠ LWW)
[G] TO BE: копия создаётся ФРОНТОМ (новая сессия + PUT /bpmn) — ⚠ нет защиты от дублей
[H] Параллельные пути: PUT /sessions (draft), PATCH /bpmn_meta, PATCH /status —
    ⚠ общий row, разные колонки, LWW между собой и с [B]
```

Точки сбоев (детально — раздел 3): **T1** фронт auto-retry после 409 молча
перезаписывает чужое состояние; **T2** upsert без SQL-CAS (LWW-ядро);
**T3** mixed-path LWW (PUT /sessions ∥ PUT /bpmn); **T4** дубли сессий race;
**T5** snapshot вне транзакции; **T6** GET с записью; **T7** stale-кэши при
сбое инвалидации; **T8** interview_json LWW при публикации.

## 2. Таблица сценариев

| ID | Сценарий | Статус | Воспроизведение / доказательство | Тяжесть |
|----|----------|--------|----------------------------------|---------|
| S1.1 | 4 параллельных PUT /bpmn с одним base | **OK** | statuses=[200,409,423,423], winner=1, rev +1 ровно, один маркер в XML — CAS+lock работают | — |
| S1.2 | PUT /bpmn ∥ PUT /sessions (разные пути) | **БАГ** | оба 200, но rev +1 вместо +2; запись PUT /sessions молча потеряна (nodes отсутствуют в финале) — LWW на общей строке | серьёзная |
| S1-UI-1 | правка→save→Rev+1→reload→данные на месте | OK (с оговоркой) | PUT /bpmn →200, rev 2→3; персист зависит от того, зарегистрировал ли modeler move (см. S1-UI-3) | — |
| S1-UI-2 | два окна, save со stale base | **БАГ** | B: `PUT /bpmn → 409`, затем фронт **сам** `PUT /bpmn → 200` (auto-retry) — rev 7→8, **конфликт-UI отсутствует** (скрин `s1_two_windows_B_after_save.png`: просто «Rev. 8»), правка окна A молча перезаписана stale-моделью B | **блокер** |
| S1-UI-3 | drag на канвасе (механика) | **ФАКТ** | drag мышью срабатывает нестабильно (в повторном тесте узел не двинулся: экран 85→85); когда move не зарегистрирован modeler'ом, save пишет неизменённый XML с rev+1 — у пользователя вид «сохранил, но не сохранилось» | серьёзная |
| S2.1 | дубли сессий: seq + parallel create | **БАГ(race)** | последовательный дубль → 409 (OK); **параллельные два POST → оба 200**, ids 2fdeed83c8/ddc19bc3e3 — дубликаты в проекте | серьёзная |
| S2-UI | повторный вход в TO BE из той же AS IS | **OK** | tobe-сессий 13→13, новых нет; контекст «TO BE из «Разогрев супа»» — существующая открывается | — |
| S2.3 | «Новая версия» recipe/template | **ФАКТ (код)** | backend: recipes/templates без версионирования (recipe_version не используется CRUD'ом), наследование полей — только на фронте; связка версий отсутствует | косметика |
| S3.1 | read-path сразу после save | **OK** | raw/sess/meta свежие через 199ms после PUT (инвалидация работает в штатном пути) | — |
| S3.2 | ui_model(nodes/edges) ↔ bpmn_xml | **ФАКТ** | nodes=0, edges=0 при 26 задачах в XML — истина только в bpmn_xml; draft-модель не синхронизируется (структурный шов: любой код, рекомьютящий XML из nodes, уничтожит диаграмму) | серьёзная |
| S3.3 | GET /bpmn с побочной записью | **ФАКТ (код)** | `_persist_regenerated` (GET → persist без lock/CAS/инвалидации) — в штате fingerprint совпадает, не срабатывает; триггерится при расхождении fingerprint | серьёзная |
| S4.1 | Rev +1 на каждый save | **OK** | rev 1→2→3→4 без пропусков/дублей | — |
| S4.2 | stale base / без base | **OK** | 409 DIAGRAM_STATE_CONFLICT / 409 BASE_VERSION_REQUIRED; rev не меняется | — |
| S4.3 | V+1 и откат restore | **OK** | user_facing 1→2, restore=200, XML восстановлен, rev+1, snapshot restore_* | — |
| S4.4 | параллельные V-снапшоты | **OK (частично)** | дублей version_number нет (CAS сериализовал); код-риск MAX+1 без UNIQUE остаётся (T5) | — |
| S5-#627 | быстрый вход/выход TO BE | **OK** | «Сохранение не завершено» не воспроизводится, тостов нет | — |
| S5-W4 | шаг «Конструктор» done | **ФАКТ** | в TO BE: ✓ только «Импорт AS IS»; «Конструктор» не done (скрин `s5_w4_tobe_steps.png`) — глубокая проверка done-критерия не проводилась (нужен прогон воркфлоу) | — |
| S5-OL1 | md5 AS IS read-only | **OK** | md5 AS IS до/после входа в TO BE и клика «Конструктор» неизменен (`134bb6bc…`); старый инвариант `54211b88…` относился к прошлой инкарнации stage-БД (пересиды) | — |
| S5-UXF | иконка «Сохранить» = тот же save | **OK** | network: `PUT /api/sessions/13f1f10b20/bpmn → 200` — обработчик не потерян при переводе на иконку | — |

## 3. Топ проблем и гипотезы корневых причин

### P1 (БЛОКЕР): фронт молча перезаписывает чужие правки после 409
- **Факт**: окно B → save → 409 → затем фронт **сам** `PUT /bpmn → 200` — rev 7→8,
  **конфликт-UI отсутствует** (скрин `s1_two_windows_B_after_save.png`: просто «Rev. 8»),
  правка окна A перезаписана **полной stale-моделью B** (все элементы, не только двинутый узел).
- **Механика (код, два независимых пути тихой перезаписи)**:
  1. **bpmn-xml пайплайн** (`saveCoordinator._runPipeline`): на 409 ретрая НЕТ —
     откат tracked-version, `setTrackedDiagramStateVersion(serverVersion)` (база принудительно
     подменяется серверной), emit "conflict". Но отставший в очереди save или следующий
     тик autosave берёт **свежую серверную базу + STALE локальный XML** → CAS проходит → 200 →
     чужие правки перезаписаны. Модал конфликта условно есть
     (`saveUploadStatus.state==="conflict"` в ProcessStage.jsx:1363), но немедленно следующий
     успешный save переводит статус в saved → модал не рендерится (в тесте conflictVisible=false).
  2. **hybrid layer-map пайплайн** (`useHybridPersistController` + `persistRetryMachine`):
     409 и 423 оба маппятся в LOCK_BUSY → `runAutoRetry()` делает до 2 автоматических ретраев
     (maxAutoRetries=2) с тем же черновиком; пользователь видит максимум infoMsg
     «Session is being updated. Retry in a moment.» — конфликт-UI на этом пути не предусмотрен.
- **Гипотеза корня**: нигде нет различения «423 lock busy» (ретраить безопасно) и
  «409 CAS conflict = чужая запись» (ретрай/повтор с подменённой базой = перезапись чужого).
  Принятие серверной версии как базы без перезагрузки модели делает любой последующий save
  формально валидным и фактически деструктивным.
- **Связь с жалобой владельца**: «иногда ошибки при сохранении» — это оно: при двух
  вкладках/окнах или autosave∥manual второе сохранение молча затирает первое,
  либо (в старых версиях) показывает «Сохранение не завершено».

### P2 (серьёзная): mixed-path LWW — PUT /sessions ∥ PUT /bpmn
- **Факт**: S1.2 — оба 200, rev +1, запись PUT /sessions исчезла. Ядро: `Storage.save`
  — upsert всех колонок без `WHERE diagram_state_version=?` (SQL-CAS есть только в
  `patch_session_meta`); лок берётся только на /bpmn и restore.
- **Гипотеза**: check-then-act (in-memory CAS) + неатомарный upsert → окно гонки между
  проверкой и коммитом; полнорядковый upsert затирает колонки параллельного писателя.

### P3 (серьёзная): дубли сессий при параллельном создании
- **Факт**: S2.1 — параллельные POST /projects/{id}/sessions с одним title → оба 200.
  Check-then-insert без UNIQUE-индекса. Объясняет исторические «38 дублей TO BE»:
  двойной клик/повторный вход гонкой → дубликаты (бэк не защищает, фронт TO BE-копий —
  тоже, хотя текущий фронт переоткрывает существующую — S2-UI OK).

### P4 (серьёзная): snapshot bpmn_versions вне транзакции сессии
- **Факт (код)**: `_create_bpmn_revision_snapshot_if_needed` — отдельный коннект до
  `st.save`; при падении save — осиротевшая версия; нумерация MAX+1 без UNIQUE
  (в тесте не словлено — CAS сериализовал, но окно есть при bypass lock'а).
- **Гипотеза**: история «V/Rev рассинхрон» — следствие orphan-snapshot'ов и
  технических версий (manual_save/export_regenerate) в одной таблице с user-facing.

### P5 (серьёзная): GET /bpmn с побочной записью
- **Факт (код)**: export при расхождении fingerprint делает persist (rev-событие)
  без lock/CAS/инвалидации кэшей — read-запрос меняет состояние и может конфликтовать
  с параллельным save. В штате не срабатывает (S3.3), но при любом пути, пишущем
  nodes без обновления fingerprint, GET начнёт молча перезаписывать XML.

### P6 (серьёзная): draft-модель (nodes/edges) мертва для XML-сессий
- **Факт**: S3.2 + probe: PUT /sessions с nodes возвращает 200, но nodes не
  персистятся (silent no-op), rev не меняется. Любой UI/API-консьюмер draft-полей
  видит пустоту и может «починить» её рекомьютом → уничтожение диаграммы (см. P5).

### P7 (косметика/наблюдения)
- Кэш-инвалидация post-commit с проглатыванием ошибок → stale до 60с при сбое Redis
  (в штате S3.1 OK).
- publish: 3× read-modify-write всего interview_json подряд → lost update при
  параллельных notes/answers; номер публикации сгорает при failed.
- S1-UI-3: нестабильная регистрация drag modeler'ом → «сохранил — не сохранилось»
  (требует ручной перепроверки: возможен артефакт Playwright-мыши, но пользовательский
  сценарий идентичен).

## 4. План исправлений (на согласование — НЕ кодить)

| # | Работа | Приоритет | Размер | Трек |
|---|--------|-----------|--------|------|
| F1 | Разделить 409 и 423 на обоих путях: 409 CAS-conflict → БЕЗ auto-retry и БЕЗ silent adopt-base — блокировать очередь saves до решения пользователя, показать конфликт-UI («перезаписать / загрузить свежее / отмена»), статус «conflict» не сбрасывать последующим save; 423 → retry ok | P0 | M | fix/save-conflict-ux (новый) |
| F2 | SQL-CAS в Storage.save (upsert с `WHERE diagram_state_version=:base`) + единая обработка 409 на всех write-путях (PUT/PATCH /sessions) | P0 | M | fix/save-cas-e2e |
| F3 | UNIQUE (org, project, lower(title), mode) для sessions (с миграцией дублей) + перевод create на `INSERT … ON CONFLICT DO NOTHING` → 409 | P1 | M | fix/session-dups |
| F4 | Snapshot bpmn_versions в той же транзакции, что и sessions row; UNIQUE (session, version_number); фоновая сверка orphan | P1 | M | fix/save-cas-e2e |
| F5 | Убрать запись из GET /bpmn (regenerate → только по явному save-пути) или обернуть lock+CAS+инвалидацией | P1 | S | fix/save-cas-e2e |
| F6 | Для XML-truth сессий: явный 409/4xx на PUT /sessions с nodes (вместо silent no-op) ИЛИ честная двусторонняя синхронизация draft↔XML | P2 | M | отдельный spike |
| F7 | publish: patch interview_json diff'ами (не весь JSON) или очередь с одним писателем; не сжигать номер версии при failed | P2 | M | fix/publish-lww |
| F8 | Overlay/meta кэш: инвалидировать на всех write-путях; outbox/ретрай инвалидации | P2 | S | fix/save-cas-e2e |
| F9 | Ручная проверка drag-регистрации modeler'ом (S1-UI-3): если подтвердится — отдельный баг «save без изменений при незарегистрированном move» (dirty-flag по событию modeler'а) | P1 | S | fix/save-conflict-ux |

## 5. Покрытие сохранений тестами — сейчас и рекомендации

**Есть (backend/tests):** `test_diagram_cas_guard` (9 — 409/CAS), `test_bpmn_put_redis_lock` (423),
`test_bpmn_restore_endpoint` (2), `test_bpmn_meta`, `test_session_cache`, `test_overlay_cache`,
`test_session_meta_endpoint`, `test_sessions_drift`, `test_session_status_transitions`,
`test_bpmn_save_rbac_scope`, `test_session_read_rbac`.
**Есть (frontend):** `ProcessStageHeader.revision-action-contract`, `undo-redo-layout`,
`save-conflict-actions`, `save-status-precedence` (view-model unit), `persistRetryMachine`-логика частично.

**Пробелы (рекомендуемый регрессионный набор сохранений):**
1. e2e «два окна»: 409 → конфликт-UI показан, без auto-overwrite (критерий F1).
2. API-тест mixed-path race PUT /sessions ∥ PUT /bpmn → ровно один winner, rev +1 (F2).
3. API-тест параллельных create session → один 200, один 409 (F3).
4. Транзакционный тест: падение save после snapshot → нет orphan-версии (F4).
5. Контракт-тест: GET /bpmn не меняет rev/состояние (F5).
6. e2e: save при dirty=false → no-op без rev+1; drag без регистрации move → dirty=false и
   подсказка «нет изменений» (F9).
7. e2e: TO BE-копия — повторный вход открывает существующую (уже в `w4_tobe_current_fix_check`).

## Приложение: артефакты аудита на stage
- Sandbox `5ae321f04f` (копия супа) — оставлена; dup-probe сессии `2fdeed83c8`, `ddc19bc3e3` + пара `-par` (доказательство P3).
- «Разогрев супа» восстановлена к исходному XML (rev=11).
- Скрины: `docs/audit/s1_two_windows_B_after_save.png` (P1), `v1_after_drag.png` (S1-UI-3), `s5_w4_tobe_steps.png`, `v3_tobe_constructor.png`.
