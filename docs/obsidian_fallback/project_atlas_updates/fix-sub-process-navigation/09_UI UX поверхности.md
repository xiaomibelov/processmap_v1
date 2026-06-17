---
title: "09 UI UX поверхности"
type: project-atlas-update
contour: fix/sub-process-navigation
date: 2026-06-15
status: source-tested
---

## Drill-down в подпроцесс

### Проблема
- Одиночный клик по `CallActivity`/`SubProcess` неожиданно проваливал в child-сессию, мешая выделению элемента.
- Breadcrumb-строка подпроцесса занимала место под хедером и сдвигала/схлопывала BPMN-канвас.

### Решение

| Элемент | Поведение |
| ------- | --------- |
| Тело `CallActivity` / `SubProcess` | Одиночный клик только выделяет элемент. Drill-down не происходит. |
| Стрелка `.bjs-drilldown` (bpmn-js overlay) | Клик открывает child-сессию: `?session=<child>&parent=<root>&focus=<target>`. |
| Breadcrumb | Рендерится внутри `.workspaceMain` как `position: absolute` overlay, а не в топ-баре. |
| Отступ breadcrumb | `top: 12px; left: 12px` — панель не прилипает к хедеру и не перекрывает канвас без нужды. |

### CSS

```css
.bpmnStageHost .bjs-drilldown {
  position: relative;
  z-index: 300;
  pointer-events: auto;
}

.subprocessBreadcrumbsOnCanvas {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 50;
  max-width: calc(100% - 24px);
  pointer-events: none;
}

.subprocessBreadcrumbsOnCanvas > * {
  pointer-events: auto;
}
```

### Layout

- `.appTopStack` объединяет `TopBar`, `AppUpdateBanner` и уведомления.
- `.appRoot` использует `grid-rows-[auto_minmax(0,1fr)_auto]`, чтобы канвас занимал всё оставшееся пространство.
- Убран legacy `height: calc(100vh - 56px - 38px)` у `.processShell`.
