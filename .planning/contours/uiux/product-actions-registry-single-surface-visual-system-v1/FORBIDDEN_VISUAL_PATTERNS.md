# FORBIDDEN_VISUAL_PATTERNS

Контур: `uiux/product-actions-registry-single-surface-visual-system-v1`

## Абсолютно запрещено

- Gradients на registry page.
- Dotted borders.
- Colored metric cards.
- Internal shadows внутри registry container.
- Multiple disconnected card styles для scope, metrics, filters, AI, warning и table.
- Filled yellow/orange aggressive warning banners.
- Colored border accents как decoration.
- Stagger animations или декоративное движение, не связанное с user action.
- Transparent gray blocks, которые выглядят как disabled/temporary layout.
- Дублированные CSV/XLSX controls.
- AI controls вне primary registry surface.
- Analytics Hub dependency.
- Properties Registry dependency.
- Dashboard/export hub.
- Fake metrics, fake rows, fake Product Actions.

## Цветовые ограничения

- Purple используется только для AI primary CTA и active scope underline.
- Green/orange strong colors используются только для table status badges.
- Warning text может использовать subdued orange/brown, но не должен становиться filled alert card.
- Metrics не используют green для `полных`.
- Tags остаются gray chips.

## Layout regressions

- Нельзя возвращать card stack, где каждый блок выглядит самостоятельным widget.
- Нельзя делать таблицу вторичной после больших metric/AI/warning panels.
- Нельзя помещать export controls в отдельный export hub.
- Нельзя добавлять внутренние section margins, которые ломают принцип one container / one separator.
- Нельзя делать header hero-like; это рабочий инструмент, а не landing page.

## Behavioral regressions, видимые через UI

- Просмотр страницы не должен мутировать Product Actions durable truth.
- Навигация и фильтрация не должны отправлять unsafe `PUT`, `PATCH`, `DELETE`.
- AI CTA не должен auto-apply suggestions без явного user confirmation.
- Scope switch не должен смешивать workspace/project/session data.
- Empty state не должен подставлять demonstration data.

## Blocker для review

Любой из пунктов выше является причиной для `CHANGES_REQUESTED` или `BLOCKED`, если дополнительно не доказано, что это существующее неизмененное поведение вне данного visual contour.
