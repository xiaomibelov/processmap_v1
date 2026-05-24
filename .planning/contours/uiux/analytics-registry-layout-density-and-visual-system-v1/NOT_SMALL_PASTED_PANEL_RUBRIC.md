# Not Small Pasted Panel Rubric

Контур: `uiux/analytics-registry-layout-density-and-visual-system-v1`

## Цель rubric

Снять субъективность из feedback "экран выглядит как маленькая вставленная панель". Agent 4 должен оценивать фактически served UI в wide viewport и фиксировать evidence screenshots/measurements.

## Measurement frame

Измерять нужно не полный browser width, а available workspace content area после global sidebar/header. Если tooling проще меряет full viewport, в отчете явно указать оба значения: viewport width и видимую content/workspace area.

## PASS thresholds

- На desktop `1280px+` registry/hub primary content должен занимать примерно `>= 85%` available workspace width, если этому не мешает existing shell layout.
- Balanced side margins должны ощущаться как page margins, а не как большой blank canvas. На `1280-1440px` одна сторона не должна доминировать пустотой сильнее основного content.
- Main registry table width должен быть близок к width header/scope/filters sections. Table не должен быть заметно уже surrounding page surface.
- На first viewport table должен читаться как next primary object after controls; metrics/sources не должны перетягивать визуальный вес.
- Hub primary module `Реестр действий` должен быть visually anchored: крупный или явно prioritized block, not one small equal card lost in whitespace.

## FAIL signals

- Inner content visually capped like `720-960px` centered panel while workspace has large empty areas on both sides.
- Header/scope/metrics/filters/table are all placed inside one narrow card with no strong table surface.
- Table occupies less visual width than metrics/cards or looks like an appendix below controls.
- Sources section has comparable or greater visual weight than the table.
- Scope selector selected state cannot be identified within 2 seconds.
- Project/session context is misleading: UI says `Не выбран` while URL/data indicate active project/session.
- Empty workspace replaces the registry with message-only blank state and removes the table skeleton.
- Analytics Hub first screen has mostly empty blank canvas and small isolated module cards.

## Visual hierarchy checklist

Reviewer should be able to answer yes within a screenshot:

- Where am I? `Аналитика` or `Реестр действий` title and back/nav are obvious.
- What scope am I looking at? Workspace/project/session state is readable.
- What is the scale of data? Metrics quickly communicate counts.
- What can I do? Filters, AI, CSV/XLSX controls are visible before table.
- What is the main object? Table is visually dominant.
- What is supporting context? Sources are secondary and separated.

## Evidence requirements

For each checked viewport, Agent 4 should include:

- screenshot filename;
- viewport size;
- route URL without secrets;
- observed content-width verdict: `PASS`, `FLAG`, or `FAIL`;
- hierarchy verdict: `PASS`, `FLAG`, or `FAIL`;
- table prominence verdict: `PASS`, `FLAG`, or `FAIL`;
- console/network mutation summary.

## Final verdict rule

`REVIEW_PASS` requires all core areas to pass: content width, table prominence, scope usefulness, empty-state structure, clean console/network, correct build identity and bounded diff. Any `FAIL` in those core areas means `CHANGES_REQUESTED`.

