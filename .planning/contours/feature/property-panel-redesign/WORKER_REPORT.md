# WORKER_REPORT — feature/property-panel-redesign

Дата: 2026-07-11
Ветка: `feature/property-panel-redesign` (base: main@5aabba98, PR #523 merged)
Статус: **реализация завершена, готово к review-гейту** (push/PR — только по команде)

## Коммиты (7 поверх 5aabba98)

| SHA | Содержание |
|-----|-----------|
| `0ac9b133` | docs: PLAN/UI/API/TESTS/STATE |
| `e15d04e1` | phase 0: модели overlayDisplaySettings/fieldChips/filterRowsByHiddenFields/toBeBuilder |
| `44842695` | hiddenFields opt-out семантика |
| `47773335` | phase 1: useOverlayDisplaySettings, PropertyDisplaySettings (2 select + chips), wiring App/NotesPanel, CSS token-only |
| `c5c844b2` | phase 2: LiveCardPreview, ToBeBuilder, useToBeState, wiring NotesPanel |
| `bcb5cadd` | phase 4: per-field фильтр V2-карт + fix порядка clear-legacy→mount-V2 |
| `1f7b9410` | test(e2e): property-panel-redesign spec (8 сценариев) |

Phase 3 (process-level properties) — integration verification: upstream PR #523
(processRootSelection, header «Процесс: …», emit `*.canvas_process_select`) intact;
наши gates (LiveCardPreview скрыт для process-like selection, To-Be показывается) подтверждены.

## Verification

| Проверка | Результат |
|----------|-----------|
| Unit sweep (`node --test "src/**/*.test.mjs"`) | 2305 pass / 35 fail — **set байт-идентичен baseline** (`/tmp/fails_base_names.txt`, 35 pre-existing на rebased-дереве) |
| Overlay suites | 38/38 green (resolver 14, coordinator 6, renderer, lifecycle, click, visibility) |
| `npm run build` | exit 0 |
| E2E `property-panel-redesign.spec.mjs` | **8/8 green** (3.0m, chromium, workers=1) |

E2E окружение: vite dev :5180 (worktree), API — processmap_v1 через SSH-туннель
127.0.0.1:8011 → root@91.184.252.237 (admin@local/admin). Backend в ветке не менялся.

## E2E сценарии (TESTS.md §3)

1. Compact panel: 2 select + chips + hints; legacy-чекбоксы отсутствуют
2. Hover-карточка на выделенной задаче; «Всегда» переживает reload
3. Legacy-ключ `fpc_properties_overlay_always_v1:{sid}` мигрирует в displayMode=always (ключ не удаляется)
4. Chip скрывает поле из legacy И V2 карт (данные не тронуты; toggle обратно — поле возвращается)
5. v2Mode «Раскрытые»: hosts expanded, legacy decor очищен
6. Live preview: seeded values + inline edit (Enter commit) без save
7. To-Be: toggle → Pool на другой задаче → «+» → draft row → Save All → property в XML
8. Keyboard: chip toggles Space/Enter, aria-pressed зеркалит состояние

## Найденные и исправленные дефекты по ходу

1. **mountFromBpmn не фильтровал BPMN-ветку** — `extractOverlaysFromBpmn` строит
   properties напрямую; resolver-фильтр покрывал только preview/registry-loop пути.
   Fix: фильтр извлечённого списка в `mountFromBpmn` + drop auto-карт с 0 полей
   (name-only/authored выживают). TDD: 2 failing tests → fix → green.
2. **Порядок clear-legacy→mount-V2** — legacy-карточка выделенного элемента
   подавляла свежий V2 host (`hasLegacyPropertyOverlay`), затем decor очищался —
   элемент оставался без карточки вообще. Fix: clear до mount (pre-existing bug,
   впервые покрыт e2e).
3. **Spec**: legacy-migration тест создавал fixture дважды (project title collision) —
   `bootDiagram` получил опцию `fixture`; inline-edit commit — Enter (Tab остаётся
   внутри двух-инпутного edit-mode по дизайну строки).

## PRE-EXISTING finding (вне скоупа контура, НЕ исправлено) — рекомендую отдельный PR

**Бесконечный render-loop в ProcessStage↔AppShell (dev warning + реальный perf-баг в prod).**
Воспроизведён на чистом main@5aabba98 (без изменений ветки):

- `useBpmnSync` (`src/features/process/hooks/useBpmnSync.js`) возвращает новый объект
  каждый рендер (нет useMemo на return).
- `registerAppSafeRefreshHandler`-effect в `ProcessStage.jsx:5935` имеет `bpmnSync`
  в deps → перерегистрируется каждый рендер → `notifySubscribers()` →
  `AppShell.setRefreshRisk(getCurrentAppRefreshRisk())` (новый объект) →
  ре-рендер AppShell → inline-лямбда `onClearWorkspaceProject` (AppShell.jsx:355)
  → ре-рендер ProcessStage → effect снова. ~1000+ рендеров за 7 секунд.

Минимальный fix (отдельным PR): `useMemo` на return `useBpmnSync` и/или
стабильный `onClearWorkspaceProject` + bail-out в `setRefreshRisk` при равном статусе.
E2E-спек фильтрует только это точное warning с комментарием; любой другой
console.error/pageerror по-прежнему роняет тест.

## Что НЕ сделано (по правилам)

- push / PR / merge / deploy — ожидают явной команды.
- D5 (runtime для Agent-3 review): открыт — :5180 локально или stage.
- AI-слой FB-помощника, real-time sync, cross-session notes — out of scope (PLAN.md).

## UI refresh (2026-07-11, по запросу пользователя со скриншотами)

4 правки во вкладке «Свойства» (та же ветка, PR #524):

1. **Сворачиваемые группы** — «Свойства над задачей», «V2-оверлеи», «Поля в оверлее»,
   «To-Be» теперь collapsible (PanelGroup: header = кнопка с chevron + label,
   body не рендерится когда свернуто). Состояние persists в localStorage
   (`fpc_prop_panel_groups_v1`, глобально — UI-предпочтение, не per-session).
   Default = всё раскрыто (e2e-селекторы и существующие флоу не требуют
   лишних кликов).
2. **Select'ы в один ряд** — «Свойства над задачей» и «V2-оверлеи» в 2-колоночном
   grid (`.overlayDisplaySelectsRow`), больше не друг над другом.
3. **Полная ширина блоков** — у `.sidebarPropertiesLayout--centered` убраны
   `padding-left/right: 12px`: «Быстрые свойства» и «Дополнительные
   BPMN-свойства» теперь edge-to-edge с остальными секциями (max-width: 672px
   сохранён — в узком сайдбаре не играет).
4. **Мини-индикатор extension-state** — glanceable twin детального
   SidebarTrustStatus: иконка ~16px (✓ saved / ✎ dirty / ⟳ syncing / ⚠ error)
   в самом верху контента вкладки «Свойства», tooltip на русском, без текста.
   Детальный индикатор с CTA «Повторить» в группе «Вспомогательное» НЕ тронут.

To-Be builder: summary pills переехали в header collapsible-группы (проп
`hideHeader` на ToBeBuilder), дубля заголовка «To-Be» нет.

Новые файлы:
- `displaySettings/PanelGroup.jsx`, `usePanelGroupsState.js`,
  `panelGroupsModel.js` (+6 unit), `extensionStateMiniView.js` (+5 unit),
  `ExtensionStateMiniIndicator.jsx` (+3 ui-copy).
- e2e: +2 теста (collapse persistence across reload; mini indicator
  saved→dirty on inline edit). Spec: 10/10 green.
