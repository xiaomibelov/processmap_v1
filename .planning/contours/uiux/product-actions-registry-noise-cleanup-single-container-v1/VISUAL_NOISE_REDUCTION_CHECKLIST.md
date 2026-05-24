# Visual Noise Reduction Checklist

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`

Используется Worker 2 при реализации и Worker 3 при подготовке Agent 4 review checklist.

## A. Запрещённые паттерны (FORBIDDEN)

- [ ] Любые `linear-gradient` / `radial-gradient` внутри страницы реестра.
- [ ] Любые `box-shadow` внутри контента (разрешена только внешняя `0 1px 3px rgba(0,0,0,0.06)` у главного контейнера).
- [ ] Цветные подложки у блоков метрик (любая `background-color` отличная от `#FFFFFF` у metric-блока).
- [ ] `border-style: dotted` / `dashed` где-либо в скоупе реестра.
- [ ] Цветные `border-left` / `border-right` декоративные полосы.
- [ ] Card-in-card: вложенные блоки с собственной border + radius + shadow.
- [ ] Фейковые/демо-данные при отсутствии реальных.
- [ ] Stagger-loading анимации строк (последовательное появление с задержкой).
- [ ] Marketing-style entrance / scale / slide-in.
- [ ] Дубли кнопок CSV/XLSX вне header.
- [ ] Жёлтая подложка / бордер у warning-блока.
- [ ] Gradient или цветная подложка у AI-блока (кроме самой AI-кнопки `#7C3AED`).
- [ ] Checkbox-колонка в таблице, если AI-выбор уже реализован через chips/scope.
- [ ] Использование цветов вне согласованной палитры (см. `UX_SPEC_IMPLEMENTATION_MAP.md` §E).

## B. Требуемые паттерны (REQUIRED)

- [ ] Один белый контейнер (radius 12, border `#E5E7EB`, тень `0 1px 3px rgba(0,0,0,0.06)`, padding 0).
- [ ] Все внутренние секции разделены `1px solid #F3F4F6`, full-width.
- [ ] Шаг отступов: 24px горизонтально / 12px вертикально по секциям.
- [ ] 16px зазор между scope tabs и контейнером.
- [ ] Header содержит: title 18/700, subtitle 13/400, «Вернуться» 13/`#6B7280`, CSV/XLSX outline 32.
- [ ] Scope tabs: inactive `#9CA3AF`, active `#111827` + underline 2px `#7C3AED`.
- [ ] Workspace scope default collapsed; chevron меняет состояние.
- [ ] Sessions workspace — компактный flex-список, не таблица.
- [ ] Metrics — одна текстовая строка, gap 32; число 20/700, лейбл 11/uppercase.
- [ ] Filters — одна компактная строка, reset = text-link, helper-text 12/`#9CA3AF`.
- [ ] Warning — строка: icon + text + правый линк, без подложки.
- [ ] AI suggestions — строка: label + chips + кнопка `#7C3AED` + счётчик, без подложки.
- [ ] Таблица: header bg `#FAFAFA`, hover `#FAFAFA`, badge только зелёный/оранжевый, BPMN code subdued.
- [ ] Раскрытие строки с chevron rotation + max-height transition; 4 read-only поля.
- [ ] Empty state при отсутствии данных.
- [ ] Bump версии в `frontend/src/config/appVersion.js`.

## C. Проверочные команды (для Worker 2 и Reviewer)

```bash
# Поиск запрещённых паттернов в скоупе реестра
rg -n "gradient|dotted|dashed|box-shadow" frontend/src/components/process/analysis frontend/src/styles \
  | grep -v ' 0 1px 3px '
rg -n "background-color:\s*#(F|f)[a-fA-F0-9]{2}|#(B|b)[a-fA-F0-9]{2}" \
  frontend/src/components/process/analysis/registry
rg -n "linear-gradient|radial-gradient" frontend/src/components/process/analysis
```

```bash
# Runtime smoke (Reviewer)
curl -sI "http://clearvestnic.ru:5180/?cb=$(date +%s)" | head -20
```
