# Runtime proof checklist

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`

## Source/runtime truth

- [ ] `pwd` зафиксирован.
- [ ] `git remote -v` проверен; credential-bearing URL не печатать в отчет.
- [ ] `git fetch origin` выполнен.
- [ ] `git branch --show-current` зафиксирован.
- [ ] `git rev-parse HEAD` зафиксирован.
- [ ] `git rev-parse origin/main` зафиксирован.
- [ ] `git status -sb` зафиксирован.
- [ ] `git diff --name-only` зафиксирован.
- [ ] `git diff --cached --name-only` зафиксирован.

## Runtime serving

- [ ] `curl -I http://clearvestnic.ru:5180` возвращает HTTP 200.
- [ ] Headers показывают no-cache/no-store или другой ожидаемый fresh-serving режим.
- [ ] Served build-info/version marker соответствует source HEAD/contour.
- [ ] Fresh browser context открыт с cache-busting query.
- [ ] Нет runtime/source mismatch: intended source equals served build.

## Browser scenarios

- [ ] Analytics Hub route открывается.
- [ ] Hub cards видны: `Реестр действий`, `Реестр свойств`, `Дашборды`, `Экспорт`.
- [ ] Navigation from Hub to Product Actions Registry работает.
- [ ] Direct Product Actions Registry route работает.
- [ ] Empty workspace scope проверен.
- [ ] Populated project scope проверен на existing data.
- [ ] Primary area содержит filters/actions/AI before table.
- [ ] Main table является primary content.
- [ ] Sources section clearly secondary.
- [ ] Row/detail behavior проверен, если implemented.

## Safety

- [ ] Browser console has no blocking errors.
- [ ] Navigation/viewing does not emit unsafe PUT/PATCH/DELETE.
- [ ] No backend/schema/BPMN/RAG runtime changes.
- [ ] No fake metrics/data introduced.
- [ ] Runtime screenshots/evidence приложены к review report.
