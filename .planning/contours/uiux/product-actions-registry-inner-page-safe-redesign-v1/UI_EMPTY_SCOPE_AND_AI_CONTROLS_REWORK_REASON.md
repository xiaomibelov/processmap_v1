# Reason: why current pass is superseded

Текущий актуальный verdict: `CHANGES_REQUESTED`.

## Доказательство от Agent 4

- `:5180` отдавал `v1.0.136`;
- `build-info.json` соответствовал `sha=5b20bc2`;
- exports/filter/pagination работали в project context;
- console был clean;
- unsafe `PUT/PATCH/DELETE` mutations при просмотре не наблюдались.

Эти пункты подтверждают, что runtime был проверен, но не закрывают UX hierarchy blocker.

## Блокирующие findings

1. `High`: exact path `Analytics -> Реестр действий` может попадать в empty workspace scope без понятной registry structure: нет headers, нет AI controls, unclear primary content.
2. `Medium`: в populated project scope AI controls размещены ниже table/pagination в secondary sources section.
3. `Medium`: merge/release блокирован dirty workspace hygiene и non-canonical checkout context до классификации.

## Следствие

Старые `REVIEW_PASS` или pass-like reports в этом contour не являются актуальным release gate. Они сохраняются как история, но superseded текущим `CHANGES_REQUESTED` до прохождения fresh Agent 4 runtime review.
