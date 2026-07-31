# REVIEW_REPORT — OL1 «Overlay: единый канвас AS IS / TO BE»

**Дата верификации:** 2026-07-31 (UTC)
**Роль:** Agent 3 (Reviewer) — независимая проверка по критериям 1–8
**Код:** `7e9a03c1 feat(ol1)` + `f8d66a1c fix(ol1)` → merged в `origin/main` через PR #630/#631
**Stage:** `stage.processmap.ru`, build `c1846c2f 2026-07-31T06:55:17Z` (5-plane serving mode ✅)

## Чек-лист критериев приёмки

| # | Критерий | Статус | Доказательство |
|---|----------|--------|----------------|
| 1 | Один канвас, два слоя; split удалён из UI | ✅ | walkthrough: `{overlay:true, oneSvg:true, splitToggle:false, splitButtons:0}`; скрин `docs/ol1/ol1_1_single_canvas.png` |
| 2 | Раскладка: TO BE рядом с derived_from-источником, без перекрытия подписей | ✅ | `{checked:24, belowOk:24, xOk:24, noLabelOverlap:24/25}` (25-й — без derived_from); скрин `ol1_2_layout.png` |
| 3 | Выделение TO BE → ореол AS IS-источника; AS IS → ореол производных | ✅ | `{asisHalo:true, traceLinks:1}` / `{asisCard:true, tobeHalo:true}`; скрины `ol1_3a/3b` |
| 4 | Hit-testing: пересечение → TO BE; AS IS read-only карточка; drag AS IS заблокирован | ✅ | `{tobeSelected:true, asisCardShown:false}`, `AS IS drag moved: false`; скрин `ol1_4_hit_testing.png`; unit: `OverlayGraphCanvas.test.mjs` (10 тестов) |
| 5 | Переключатели «AS IS» / «Связи происхождения», дефолты | ✅ | `«Связи происхождения» always: 25`, `«AS IS» скрыла подложку: true`; скрины `ol1_5a/5b` |
| 6 | Трансформация в overlay: бейджи, accept/reject, исчезновение отклонённого | ✅ | `бейджей 25/25 узлов`, `reject: 25 → 24 узла`; скрин `ol1_6_decisions.png` |
| 7 | Регрессия | ✅ | PR #627 fix-check EXIT=0 (stage, stepBar стабилен 6с, тот же DOM-узел); AS IS md5 `54211b88a54d62500e999341179f0f60` неизменён; сессионные шаги all done; E7/BPMN round-trip 7/7; backend transformation 18/18; frontend graph/workspace 28/28 |
| 8 | Полный путь в overlay (create TO BE → … → пилот), EXIT=0 | ✅ | `scripts/ol1_walkthrough.mjs` EXIT=0, stage, technologist-demo; видео `docs/ol1/ol1_walkthrough.webm` + 9 скринов; все 7 шагов done; publish template/recipe 200 |

## Тесты, обновлённые/добавленные под overlay (критерий 7, список)

- `frontend/src/features/technologist/graph/overlay.test.mjs` — NEW, 8 тестов (OL1.2 layout, OL1.3 trace index, OL1.4 link pairs)
- `frontend/src/features/technologist/graph/OverlayGraphCanvas.test.mjs` — NEW, 10 тестов (z-order, dimming через CSS-var, click routing, AS IS drag-invariant, trace halo, badges)
- `frontend/src/features/technologist/transform/TransformReview.test.mjs` — 5 тестов (E3.5, без изменений поведения)
- `scripts/ol1_walkthrough.mjs` — NEW, приёмочный скринкаст критерии 1–6+8
- Прогоны 2026-07-31: frontend 28/28 ✅; backend 18/18 ✅ (pipeline, golden, process_layer); round-trip 7/7 ✅

## Отклонения / риски ⚠️

1. **Раскладка «под», а не «рядом»**: TO BE ставится строго под источником (same X, `y = src.y + height + 48`), а не со смещением в сторону. Формально эпик допускает («не прямо поверх»), но отличие от буквы OL1.2 — на усмотрение владельца. `noLabelOverlap` 24/24.
2. **Тема**: `--graph-canvas-asis-opacity` — CSS-переменная с fallback 0.35, но ни одна тема её явно не определяет; параметра насыщенности (saturation) нет. Цвет trace-highlight `#7b5cff` захардкожен.
3. **Split не удалён физически**: живёт за `localStorage.ws_split_debug=1` (`Workspace.jsx:74-78, 725-789`) + `TransformReview.jsx` (standalone E3.5) всё ещё side-by-side. Эпик разрешает скрытый flag; TransformReview — вне «рабочего места», решение владельца.
4. **Ветвление**: работа велась в long-lived `feature/e1-e2-technologist-workflow`, а не в one-contour-one-branch (отклонение от AGENTS.md §2, устоявшийся флоу владельца). Уже в main через PR #630/#631.
5. **Рабочее дерево pm-e3/app**: после прогонов есть uncommitted артефакты (`docs/ol1/*`, `docs/fix/*`, `docs/w4/*`, `docs/e35/golden_report.json`) — свежие доказательства 2026-07-31 09:05 UTC. Не коммичено (ждёт решения владельца).
6. **RAG**: `localhost:8011` отклонил hardcoded sub из skill (`invalid_user`) — контур верифицирован без RAG-контекста.
7. **Viewport «дышит»**: `computeViewBox` перефитивает на каждый drag; pan/zoom отсутствует (кандидат в следующий контур).

## Git-proof

- repo: `/root/pm-e3/app` (origin: `git@github.com:xiaomibelov/processmap_v1.git`)
- served (stage): `c1846c2f` = Merge PR #631, содержит `7e9a03c1` + `f8d66a1c` + `4b59026d` (PR #627 fix)
- merge-base проверки в `/opt/processmap-test` (свежий fetch): все три коммита ∈ `origin/main` ✅

## АПРУВ ВЛАДЕЛЬЦА — 2026-07-31

**ЭПИК АПРУВНУТ.** Решения по отклонениям:
1. Раскладка «строго под источником» — принята (родословная вниз / поток вправо, noLabelOverlap 24/24); контур «столбец справа» не заводить до обратной связи технологов.
2. Тема — принята с добивкой в backlog: trace-цвет `#7b5cff` → CSS-переменная, параметр saturation (оба в `.planning/BACKLOG.md`).
3. TransformReview.jsx — оставить как legacy-инструмент (не вторая истина); деприкейтнуть при следующем касании. Split за feature-flag — ок.
4. Артефакты — коммитить (правило «артефакт = файл в репозитории»).
5. RAG-токен — к сведению.
Замечание на будущее (в backlog): единый скринкаст «вход → overlay → полный путь» для технологов.

## Handoff-proof

Цель: верифицировать OL1 по критериям 1–8 и подготовить запрос апрува. Закрыто: все 8 критериев ✅ на stage (свежие прогоны, EXIT=0). Итог: АПРУВ 2026-07-31, артефакты закоммичены в PR-ветку, backlog-хвосты зафиксированы. Осталось: prod deploy — вручную владельцем (AGENTS.md §7).
