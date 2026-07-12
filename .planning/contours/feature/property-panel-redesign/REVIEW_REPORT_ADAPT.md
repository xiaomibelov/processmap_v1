# REVIEW_REPORT — адаптация #524 по скриншотам и требованиям (2026-07-12)

Scope: поверх `origin/feature/property-panel-redesign` @ `a2bd5240`. Frontend-only. Save pipeline и backend не трогаем.

> ⚠️ Скриншоты (527 / 524 / reference) не найдены на диске — layout построен по текстовой
> спецификации. Для pixel-уровня (dense, «+10%») нужны скриншоты или подтверждение интерпретаций D3/D4.

## A. Что берём из #526 (feature/mini-indicator-from-524)

| Артефакт | Статус |
|---|---|
| `ExtensionStateMiniIndicator.jsx` + `extensionStateMiniView.js` | **Уже идентичны** на #524 (byte-identical diff) — брать нечего |
| BpmnStage clear-before-remount fix | **Уже есть** на #524 (L4737-38, это и был источник заимствования) |
| P0/P1 segmented controls (SegmentedControl/ToggleSwitch/DisplaySettingsBlock) | **НЕ переносим** — #524 использует select-based UI; пользователь этого не требовал |

Вывод: из #526 фактически ничего не требуется — паритет подтверждён.

## B. Что меняем в #524 (по требованиям)

### B1. Indicator в шапку аккордеона (треб. 1)
- Сейчас: индикатор в BODY «Свойства» (`propertiesTabTopRow`), скрыт при свёрнутом аккордеоне.
- `SidebarAccordionSection` не имеет слота `headAccessory` (0 hits) → **добавить prop `headAccessory`** (рендер справа от title, клик-стоп, виден всегда).
- Перенести `ExtensionStateMiniIndicator` из body в `headAccessory` секции «Свойства».

### B2. Per-element флаг: скрыть UI, **вернуть write-path** (треб. 2)
- Сейчас на #524: `setShowPropertiesFlag` **полностью удалён** (guard-test `doesNotMatch /setShowPropertiesFlag/`). Флаг читается из XML (`bpmnOverlayParser`), но не пишется → **при любом save флаг `fpc-show-properties` будет потерян из XML (data-loss)**.
- Требование: «сохраняется в XML как раньше, не удалять код флага — только скрыть из рендера».
- Fix: восстановить скрытый draft-row write-path (row `fpc-show-properties` прокидывается в extension state при save, без UI-контрола), guard-test обновить: запрет рендера тоггла в UI, но наличие write-path.
- Overlay-видимость (read-path) без изменений.

### B3. V2 ↔ display mode автоматика (треб. 3)
- Сейчас: `v2Mode` — select из 3 значений (`none`/`all`/`expanded`), ортогонален `displayMode`.
- **D3 (интерпретация)**: «V2 toggle ON» = `v2Mode !== "none"`. Автоматика: при включении V2 → `displayMode` принудительно `"hidden"`, select displayMode disabled + hint «Скрыто автоматически: включены V2-оверлеи»; при `v2Mode="none"` → восстановление предыдущего значения (default `"hover"`). Логика в чистой модели `overlayDisplaySettings.js` (prev-value хранится в том же JSON) + unit-тесты.

### B4. Быстрые свойства: collapsible + removable (треб. 4)
- Collapsible: обернуть блок в существующий паттерн collapse (как AdditionalBpmnPropertiesSection) или PanelGroup; состояние — в `fpc_prop_panel_groups_v1` (новый groupId `quickProps`).
- Defaults не locked: `DEFAULT_QUICK_PROPERTY_NAMES` остаются только начальными pin-ами; unpin/remove слота разрешён (убрать early-return в `pinName/unpinName` для defaults). Удаление значения → как сейчас; удаление самого свойства из списка → unpin + drop. «+ Добавить» / `QuickNewPropertyRow` без изменений.

### B5. Layout и порядок (треб. 5)
- Требуемый порядок: **Preview → Display mode/V2 → Быстрые свойства → To-Be → Доп. BPMN**.
- Сейчас: indicator → LiveCardPreview → PropertyDisplaySettings → **ToBeBuilder** → CamundaPropertiesSection(Быстрые → Доп. BPMN). To-Be стоит ПЕРЕД быстрыми свойствами, а быстрые/доп. живут внутри `ElementSettingsControls`.
- Fix: ToBeBuilder перенести из NotesPanel в слот `afterQuickProperties`, прокинутый в `ElementSettingsControls` → рендер между блоком «Быстрые свойства» и `AdditionalBpmnPropertiesSection`.
- «Доп. BPMN +10%» — **D4 (интерпретация)**: блок делается ~10% шире sibling-блоков через negative inset margins (контентная ширина +10%), отступы/типографика — tokens.css.
- Dense: уменьшить gaps между PanelGroup/блоками (token-based spacing), без hardcoded colors.

### B6. Floating save bar (треб. 6)
- Сейчас: sticky `bottomBar` в SidebarShell, «Сохранить всё» + «Сбросить», всегда виден (disabled без изменений).
- Fix: floating bar ≤48px (1px top border, token `--border`), **рендерится только при `sidebarGlobalHasChanges`**, кнопки «Сохранить» (primary) + «Отмена» (text-only). Логика save (`handleSidebarSaveAll`) и reset — без изменений.

## C. Новое (нет ни в #524, ни в #526)
1. `headAccessory` prop в `SidebarAccordionSection`.
2. Coupling-модель V2→displayMode в `overlayDisplaySettings.js` + unit-тесты.
3. Скрытый write-path `fpc-show-properties` (restore) + обновлённые guard-тесты.
4. Слот `afterQuickProperties` в `ElementSettingsControls`.
5. Floating SaveBar стили/рендер-гейт.
6. E2E: адаптировать `property-panel-redesign.spec.mjs` (10 тестов): indicator в head (collapsed-visible), V2→hidden автоматика + restore, collapsible quick props + removable defaults, To-Be placement, save bar visibility gating.

## D. Открытые интерпретации (нужен approve)
- **D1**: скриншоты недоступны — работаем по тексту? (или приложить)
- **D2**: B2 = именно restore write-path (иначе data-loss флага при save) — так и задумано?
- **D3**: «V2 toggle» = `v2Mode≠none` (select остаётся 3-значным) — ок, или заменить select на toggle?
- **D4**: «+10%» = negative inset (ширина контента +10%) — ок?
- **D5**: To-Be остаётся (треб. 5 явно включает его в порядок) — EN-бейджи локализовать в RU заодно?

## E. Acceptance mapping
AC-список пользователя → B1..B6 + C6. Build PASS; unit: baseline на этой ветке переснимется (ветка добавляет свои тесты); E2E `property-panel-redesign` 10/10 + регрессия process-properties 5/5, v2-overlay 3/3, extension-state-mini 2/2.

## F. Риски
- Switch на ветку: локальные untracked `.planning/contours/feature/property-panel-redesign/` конфликтуют с tracked версиями на ветке → перед `git switch` отложить локальные копии, затем коммитить обновлённые артефакты в ветку.
- `.env` (deploy injection) исключать из коммитов.
- B2: restore write-path должен быть byte-совместим со старой семантикой (row `fpc-show-properties` в draft, immediate save при toggle — но UI нет, значит только round-trip preserve).
