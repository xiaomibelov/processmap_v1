# UI-решения — analysis-tabs-ux-polish-p3

## Глоссарий (одно понятие = одно слово)

| Понятие | Русский | English | Где используется |
|---------|---------|---------|------------------|
| START | START | START | Границы |
| INTERMEDIATE | INTERMEDIATE | INTERMEDIATE | Границы |
| FINISH | FINISH | FINISH | Границы |
| Не заполнено / не выбрано | Не выбрано | Not selected | статусы границ |
| Заполнено | Заполнено | Filled | статусы границ |
| Lead time | Lead time | Lead time | KPI |
| Активное время | Активное время | Active time | KPI |
| Ожидания | Ожидания | Wait time | KPI |
| Mainline время | Mainline время | Mainline time | KPI |
| Средняя длительность шага | Средняя длительность шага | Average step duration | KPI |
| Привязка к BPMN | Привязка к BPMN | BPMN binding | KPI |
| Throughput | Throughput | Throughput | KPI |

## Решения по вкладкам

### Границы
- Статус START считается заполненным, если заполнен **Trigger** или выбран стартовый lane. Это устраняет противоречие «Trigger заполнен, но START не выбран».
- Статус FINISH считается заполненным, если заполнен finish-state или выбран finish-lane.
- Все статусы используют один набор лейблов (`processAnalysis.boundaries.statusMissing/statusFilled/triggerFilled`).
- Под степпером добавлен инфоблок: «Границы определяют, какие шаги попадают в метрики Итогов. Без границ KPI = 0».

### Итоги
- KPI-карточки получили тултипы с определением метрики (`processAnalysis.kpi.tooltip.*`).
- Если все KPI = 0, показывается hint с пояснением и CTA перейти к Границам.
- Блок «Топ-3 ожидания» показывает одно пустое состояние вместо дублирующихся строк.

### AI
- Ошибки LLM маппятся на человекочитаемый текст; технический код вынесен в отдельный мелкий блок.
- Empty-state и error-state не рендерятся одновременно.
- RAG-статус использует i18n-ключи (`processAnalysis.ai.ragStatus.*`).

### Действия / Ветки / Исключения
- В рамках этой итерации затронуты только общие компоненты пустых/ошибочных состояний и i18n. Детальная переработка тулбара и группировки веток оставлена за рамками минимального патча (см. REGRESSION.md).

## Источники ui-ux-pro-max

- `design-system/processmap/MASTER.md` — цвета, типографика, отступы, accessibility (контраст, focus-ring).
- Page-override `design-system/processmap/pages/process-analysis.md` — без специфических отклонений от Master.
