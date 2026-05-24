# Visual Before / After Report

Без runtime-скриншотов (Worker 2 не выполняет :5180 проверку — это работа Reviewer). Ниже — словесное описание визуальных дельт по секциям.

## До (baseline на `origin/main` + предыдущие контуры)

- Page-фон — линейный gradient `linear-gradient(180deg, hsl(var(--panel)), hsl(var(--bg-soft)))`.
- Контейнер `productActionsRegistryPanel` — gradient-фон + `box-shadow: 0 24px 80px hsl(var(--bg) / 0.42)` (внутренняя тяжёлая тень).
- Метрики — пять отдельных карточек с border + bg, выглядят как «карточки в карточке».
- Фильтры — селекторы + framed reset-кнопка «Сбросить фильтры» (`secondaryBtn smallBtn`).
- Warning — `productActionsRegistryIncompleteBanner` с жёлтой подложкой `hsl(var(--warning)/0.08)` и border `hsl(var(--warning)/0.35)`.
- AI — `productActionsRegistryPrimaryActions` с локальной border + background; AI review (`productActionsRegistryAiReview`) — отдельный блок с цветной подложкой `hsl(var(--accent)/0.06)`.
- Workspace notice — `productActionsRegistryWorkspaceNotice` с `border-style: dashed`.
- Sessions workspace — таблица-style с собственными borders/rows (6-колоночный grid header + строки с padding/border).
- Таблица — без раскрытия строки, без BPMN-кода в subdued-стиле; колонки 0.9/1.2/1.2/0.5 fr.
- Каждая секция — самостоятельный «остров» с border + bg, страница ощущается как набор разрозненных блоков.

## После (контур `noise-cleanup-single-container-v1`)

- Page-фон — плоский `#F3F4F6`.
- **Один белый контейнер** `.productActionsRegistryContainer`: `#FFFFFF`, radius 12, border `#E5E7EB`, shadow `0 1px 3px rgba(0,0,0,0.06)`, padding 0. Все основные секции — внутри.
- Header — над контейнером, отделён `border-bottom: 1px solid #E5E7EB`. Title 18/700 `#111827`, subtitle 13/400 `#6B7280`. CSV/XLSX — outline 32px `#D1D5DB`, **только тут**. «Вернуться» — text-link 13/`#6B7280`.
- Scope tabs — flat row с underline 2px `#7C3AED` у активной, без pill/dotted/grey-карточек.
- Workspace scope — `<details>` свёрнут по умолчанию, chevron `▸` поворачивается на `▾` при раскрытии.
- Sessions workspace — компактный список (`.productActionsRegistrySessionCompactList`), row-divider `#F3F4F6` 1px, hover `#FAFAFA`. Кнопки: «Открыть проект» outline `#D1D5DB`, «Открыть сессию» `#7C3AED`/`#FFFFFF`.
- Metrics — одна строка flex gap 32: `<число 20/700 #111827> <лейбл 11/uppercase #9CA3AF>`. «Неполных» — `#F59E0B`. «После фильтров» приглушено если равно общему.
- Filters — компактная строка 110×34 селекторов; reset — text-link `#6B7280` (hover `#374151` underline); helper `Фильтры применяются к загруженным строкам.` 12/`#9CA3AF`.
- Warning — flat row: icon `#F59E0B` 14px + текст 13/`#B45309` + правый link `Показать только неполные` 13/`#7C3AED`. Без жёлтой подложки, без border.
- AI suggestions — flat row: label `AI-ПРЕДЛОЖЕНИЯ` 12/600 uppercase `#9CA3AF` letter-spacing 0.05em → chips `Все видимые / Без действий / Неполные` (inactive `#F3F4F6/#6B7280`, hover `#EDE9FE/#5B21B6`) → правая кнопка `AI: предложить действия` (`#7C3AED`/`#FFFFFF`) → counter `Выбрано для AI: N/10` (`#9CA3AF`, при N>0 → `#7C3AED`, при N>10 → `#F59E0B`). Без gradient, без подложки.
- Registry table — header bg `#FAFAFA`, 11/600 uppercase `#6B7280` letter-spacing 0.05em, padding 10/24. Колонки 20/25/35/20. Row padding 12/24, border-bottom `#F3F4F6`, hover `#FAFAFA` 0.15s. Раскрытие строки: chevron `▸→▾` 0.2s + `max-height: 0→240px` 0.25s, внутри — `<dl>` 4 read-only: `ID · BPMN · Сессия · Дата`.
- Badge: «Полная» — bg `#ECFDF5` text `#10B981`; «Неполная» — bg `#FFFBEB` text `#F59E0B`. Никаких других цветов.
- Footer — приглушённая meta-строка 12/`#9CA3AF`.

## Ключевые отличия одним взглядом

| Параметр | До | После |
|---|---|---|
| Контейнеры | 7+ «островов» с border/bg/shadow | 1 белый контейнер + 1 для AI review |
| Палитра | hsl-переменные с gradient-фонами | плоские HEX из target палитры |
| Метрики | 5 карточек с подложкой | 5 inline-чисел в одной строке |
| Warning | жёлтый баннер | строка-уведомление |
| AI | gradient/colored | flat row + 1 акцентная кнопка |
| Sessions | таблица | компактный flex-список |
| Раскрытие строки | отсутствовало | chevron + max-height + 4 поля |
| Тени | внутренняя тяжёлая | внешняя `0 1px 3px rgba(0,0,0,0.06)` |
| Dotted/dashed | присутствовал в Workspace notice | удалён |

## Screenshot paths

Скриншоты не делаются Worker 2 (нет runtime-доступа в этом исполнителе). Reviewer обязан собрать proof на `http://clearvestnic.ru:5180/?cb=<ts>` согласно `RUNTIME_PROOF_CHECKLIST.md`.
