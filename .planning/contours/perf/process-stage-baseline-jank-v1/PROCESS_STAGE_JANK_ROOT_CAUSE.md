# Корневой источник jank в ProcessStage — perf/process-stage-baseline-jank-v1

## Ранжирование гипотез H1–H9

| Гипотеза | Статус | Доказательство |
|----------|--------|----------------|
| H1. ProcessStage re-renders continuously and drags Diagram with it. | ✅ **Подтверждена** | Idle baseline показывал ~74 long tasks/сек даже без взаимодействия. Обёртка `memo(ProcessStage)` устранила idle jank полностью (0 long tasks). |
| H2. useProcessTabs или interview projection вызывает baseline long tasks. | ⚠️ **Частично** | InterviewStage тоже давал вклад, но не доминировал. `memo(InterviewStage)` снизил нагрузку. |
| H3. Polling/auth/presence/version requests trigger expensive React shell rerender. | ✅ **Подтверждена** | Снижение частоты polling (360→5000мс, 900→5000мс, 2000→5000мс, 9000→15000мс) устранило регулярные long tasks в idle. |
| H4. Property panel or selected-element sync re-renders during drag. | ⚠️ **Вторична** | Вклад есть при первом выборе элемента, но не доминирует при canvas pan. |
| H5. Toolbar/discussions/search/focus controls re-render during drag. | ⚠️ **Вторична** | `memo(ProcessStageDiagramControls)` снизил этот вклад. |
| H6. Version/update ledger adds render churn. | ❌ **Отвергнута** | Version badge уже был изолирован в footer, не на canvas. Вклад минимален. |
| H7. BpmnStage props are unstable; memo boundaries are ineffective. | ✅ **Подтверждена** | `memo(BpmnStage)` + `useStableDraft` дали материальное улучшение. |
| H8. React baseline jank is from large object identity churn. | ✅ **Подтверждена** | `useStableDraft` стабилизирует draft-ссылки и предотвращает лишние re-render. |
| H9. Remaining lag is browser/SVG after React is optimized. | ⚠️ **Частично** | После оптимизации React оставшиеся long tasks при drag коррелируют с плотностью диаграммы (SVG), а не с React. |

## Корневой источник (Root Cause)

**Primary**: Комбинация H1 + H3 + H7 + H8.

1. **ProcessStage не имел memo-границы** — любой setState в AppShell вызывал полный перерендер 6880-строкового компонента и всего его поддерева (BpmnStage, InterviewStage, панели, toolbar).
2. **Polling-таймеры слишком частые** — 360мс, 900мс, 2000мс и 9000мс интервалы создавали непрерывный поток setState даже при отсутствии пользовательских действий.
3. **Нестабильные пропсы в BpmnStage** — объектные пропсы (draft, callbacks) меняли идентичность на каждом рендере, делая `React.memo` неэффективным без дополнительной стабилизации.

## Evidence

- Idle 10 с до: ~74 long tasks.
- Idle 10 с после: 0 long tasks.
- Разница объясняется именно устранением непрерывных re-render и снижением polling.
