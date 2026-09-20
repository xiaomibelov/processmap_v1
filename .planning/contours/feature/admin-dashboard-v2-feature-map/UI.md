# UI — компоновка «Сводки» (/admin/dashboard), Вариант 1 (APPROVED 2026-09-21)

> Фиксация реализованной компоновки (итерация UX-POLISH, Вариант 1). Живой рендер: `evidence/ux-after/`.

## Порядок секций (сверху вниз, первый экран без скролла)

1. **Требует реакции** — slim full-width плашка. Сигналы есть → чипы `[label] [count] →` (клик → onNavigate(href), min-h 44px, hover/focus ring). Нет → одна строка `✓ Всё в порядке` (низкий вес, data-testid `attention-clear`).
2. **Система** — полоса фактов одной строкой: Redis · Очередь · Активные сессии · Проекты · Save latency · Сгенерировано; отсутствующие не рендерятся.
3. **Сетка `lg:grid-cols-3`** (`items-start`):
   - `lg:col-span-2` — **Возможности системы**: аккордеон доменов (дефолт — первая группа; состояние в sessionStorage `pm-admin-capability-map`). Строка = grid `minmax(0,1fr)_6rem_minmax(0,1fr)_auto`: name (truncate) | бейдж статуса фикс. ширины w-24 | fact (truncate) | стрелка `→` у правого края. Строка целиком — кликабельная кнопка (aria-label «Открыть: <название>», min-h 44px, hover bg-slate-50, focus ring).
   - 1 колонка — **Feature Flags** (компактный каталог).
4. **Недавние события аудита** — full-width таблица; actor = email целиком, иначе первые 8 символов id + полный id в `title`.

## Компактный каталог флагов

- Заголовок группы: uppercase + счётчик флагов справа.
- Строка флага: `[toggle в label min-h 44px][кнопка-строка min-h 44px: name (truncate) + maturity-бейдж + (env-hint ≥2xl) + шеврон ›]`; клик по строке/шеврону (не по toggle) раскрывает подстроку (`aria-expanded`, `aria-controls`): env-hint (read-only), description, Владелец-контур, Критерий снятия.
- Env-флаги: checkbox disabled + title; подсказка в строке (≥2xl) и в раскрытой панели.
- Optimistic toggle через PATCH + откат с inline-ошибкой (`role="alert"`), без нативных диалогов.

## Ограничения визуала

Только существующие utility-классы (slate/emerald/amber/pm-tobe-палитра админки), без raw hex и новых шрифтов. Тексты — `admin.dashboardPage` (ru/en, `dashboardI18n.js` → getDict()). Hit-area интерактива ≥44px; hover/focus-фидбек на всех кнопках/строках.
