# T1 — фактический срез stage-БД (GET /api/sessions, 2026-08-05T09:24:05.161Z)

| Метрика | Значение |
|---|---|
| Сессий всего (org_default, limit 500) | 261 |
| С формальным признаком сабпроцесса (parent_session_id ≠ "") | 40 |
| Ловятся текущим regex по имени | 22 |
| Флаг ∧ regex (совпадают) | 20 |
| **Флаг ∧ ¬regex — regex ПРОПУСКАЕТ сабпроцесс (попадёт в пикер)** | 20 |
| **¬Флаг ∧ regex — regex ЛОЖНО помечает обычную сессию** | 2 |
| Orphans (родитель удалён — dead-session хвост) | 20 |

## Расходящиеся сессии (flag ≠ regex)
- `d54dc356d4` «subprocess-rt-check-1785844400» flag=false regex=true parent=—
- `5e1453bf51` «subprocess-rt-check-1785844376» flag=false regex=true parent=—
- `4c610b9098` «Хранение шпильки в Холодильной камере» flag=true regex=false parent=1e4e833505
- `b3168462d3` «Хранение шпильки в Холодильной камере» flag=true regex=false parent=1e4e833505
- `e1999d6bee` «Проверить закрытие емкости» flag=true regex=false parent=1e4e833505
- `f2897bb45d` «Проверить закрытие емкости» flag=true regex=false parent=1e4e833505
- `14c6a10035` «Добавить ингредиент Кинза обработанная» flag=true regex=false parent=1e4e833505
- `238a449c87` «Налить базу Том Ям» flag=true regex=false parent=1e4e833505
- `620818b0bf` «Добавить ингредиент Перец чили» flag=true regex=false parent=1e4e833505
- `5790f0861e` «Хранение ящика в Холодильной камере» flag=true regex=false parent=1e4e833505
- `8f8ea3bce5` «Проверка готовой продукции» flag=true regex=false parent=1e4e833505
- `24e67fc6b5` «Упаковать готовый продукт Суп Том Ям Премиум» flag=true regex=false parent=1e4e833505
- `7162fcbf77` «Хранение шпильки в Холодильной камере» flag=true regex=false parent=240167273b
- `4ec0b8f684` «Хранение шпильки в Холодильной камере» flag=true regex=false parent=240167273b
- `521de8a1fb` «Проверка готовой продукции» flag=true regex=false parent=240167273b
- `8b0b85657a` «Добавить ингредиент Перец чили» flag=true regex=false parent=240167273b
- `227e9f7ec3` «Добавить ингредиент Микс кинза и лук» flag=true regex=false parent=240167273b
- `2abcfa282e` «Добавить ингредиент Зелень» flag=true regex=false parent=240167273b
- `cdff1149ac` «Налить Бульон Фо-Бо со специями» flag=true regex=false parent=240167273b
- `6d1ed7ad99` «Добавить ингредиент Лапша рисовая Фо-Бо отварная» flag=true regex=false parent=240167273b
- `f0078ab05e` «Добавить ингредиент Лук фри» flag=true regex=false parent=240167273b
- `2838aae25a` «Добавить ингредиент Говядина» flag=true regex=false parent=240167273b

## Orphans (дочерняя сессия, родитель удалён)
- `4c610b9098` «Хранение шпильки в Холодильной камере» missing_parent=`1e4e833505`
- `b3168462d3` «Хранение шпильки в Холодильной камере» missing_parent=`1e4e833505`
- `e1999d6bee` «Проверить закрытие емкости» missing_parent=`1e4e833505`
- `f2897bb45d` «Проверить закрытие емкости» missing_parent=`1e4e833505`
- `14c6a10035` «Добавить ингредиент Кинза обработанная» missing_parent=`1e4e833505`
- `238a449c87` «Налить базу Том Ям» missing_parent=`1e4e833505`
- `620818b0bf` «Добавить ингредиент Перец чили» missing_parent=`1e4e833505`
- `5790f0861e` «Хранение ящика в Холодильной камере» missing_parent=`1e4e833505`
- `8f8ea3bce5` «Проверка готовой продукции» missing_parent=`1e4e833505`
- `24e67fc6b5` «Упаковать готовый продукт Суп Том Ям Премиум» missing_parent=`1e4e833505`
- `7162fcbf77` «Хранение шпильки в Холодильной камере» missing_parent=`240167273b`
- `4ec0b8f684` «Хранение шпильки в Холодильной камере» missing_parent=`240167273b`
- `521de8a1fb` «Проверка готовой продукции» missing_parent=`240167273b`
- `8b0b85657a` «Добавить ингредиент Перец чили» missing_parent=`240167273b`
- `227e9f7ec3` «Добавить ингредиент Микс кинза и лук» missing_parent=`240167273b`
- `2abcfa282e` «Добавить ингредиент Зелень» missing_parent=`240167273b`
- `cdff1149ac` «Налить Бульон Фо-Бо со специями» missing_parent=`240167273b`
- `6d1ed7ad99` «Добавить ингредиент Лапша рисовая Фо-Бо отварная» missing_parent=`240167273b`
- `f0078ab05e` «Добавить ингредиент Лук фри» missing_parent=`240167273b`
- `2838aae25a` «Добавить ингредиент Говядина» missing_parent=`240167273b`

## Вывод
Regex и формальный признак расходятся на 22 сессиях — доказательство бага T1. Переход на `parent_session_id` обязателен; regex остаётся только fallback для старых данных с логированием срабатывания.
Колонка parent_session_id заполняется при создании дочерних сессий (40 шт. в данных) — «ставится всегда» подтверждено фактом наличия значений.


---

**Метод**: `.planning/contours/ops/tobe-workspace-ux/t1-data-audit.mjs` — GET /api/sessions?limit=500 (полный dump модели, эквивалент SELECT * FROM sessions по org_default), сравнение `parent_session_id` с regex `/(подпроцесс|subprocess|Activity_[a-z0-9]+)/i` из `frontend/src/lib/tobeSources.js`.

**Осознанные решения по данным:**
- **Orphans (20 шт., родитель удалён)**: дочерняя сессия с непустым `parent_session_id` исключается из пикера источника TO BE независимо от живости родителя. Это осознанное поведение (сабпроцесс — не самостоятельный источник TO BE), зафиксировано тестом `tobeSources.test.mjs` (кейс «orphan-сабпроцесс исключён»).
- **Дубликаты дочерних сессий** (одинаковые title при одном parent, напр. «Хранение шпильки…» ×2) — предсуществующий дефект `find_or_create_child_session`, вне скоупа T1.
