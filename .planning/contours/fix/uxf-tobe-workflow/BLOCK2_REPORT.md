# UXF — Блок 2: реализация UX по ux_concept.md v1.1

**Коммит:** `15b8d593` (ветка `feature/uxf-tobe-workflow-ux`)
**Дата:** 2026-07-31
**Концепт:** `docs/uxf/ux_concept.md` v1.1 (апрув владельца 2026-07-31, решения §9)

## Реализовано

1. **Сегмент «Схема | TO BE»** в шапке (TopBar `.topCenter`, стили `.seg/.segBtn`).
   `modeSwitch` из App.jsx → AppShell → TopBar. Возврат в «Схему» — 1 клик.
2. **Точка входа** «Создать/Открыть TO BE» — primary в тулбаре диаграммы
   (ProcessStageHeader, правый слот). Резолв существующего TO BE через
   `process_layer` + `derived_from_session_id` из summary.
3. **Скрытие аналитики в TO BE** — табы хоста/bpmn.io уже скрывались через
   `stageOverride`; добавлено: левая панель хоста (NotesPanel со всеми
   секциями) заменяется на `tobe-left-panel`, `NotesMvpPanel` (обсуждения)
   не рендерится.
4. **Левая панель TO BE** (§4): «← К схеме», контекст «TO BE из «…»»,
   зеркало 7 шагов (портал `#tobe-steps-slot` из Workspace, `title` = причина
   недоступности), слот панели параметров `#tobe-sidebar-slot` (как раньше).
5. **Токены** (§6): `--graph-canvas-trace-color`/`--graph-canvas-trace-glow`
   (хвост OL1: `#7b5cff` → var), `--graph-canvas-asis-saturation`,
   `--ws-canvas-asis-opacity`, `--ws-step-*` (step-bar и зеркало).
   Определения — `styles/tokens.css`.

## Файлы

App.jsx, components/{TopBar,AppShell,ProcessStage}.jsx,
features/process/stage/{orchestration/buildDiagramViewModel.js,ui/ProcessStageHeader.jsx},
features/technologist/{graph/GraphCanvas.css,workflow/WorkflowBar.css,workspace/Workspace.jsx,workspace/Workspace.css},
styles/tokens.css, scripts/{uxf_check_block2.mjs (новый), w4_tobe_current_fix_check.mjs (tobe-close→tobe-left-back)}.

## Верификация (preview build 127.0.0.1:5198 → реальный stage API)

- `scripts/uxf_check_block2.mjs` — **EXIT=0**: сегмент в обе стороны, вход из
  тулбара («Открыть TO BE» с резолвом имени), левая панель + 7 шагов,
  хост-секции скрыты, токены определены, возврат 1 кликом.
- Регрессия Блока 1 `uxf_check_bugs.mjs` — **EXIT=0** (B4 со статусами
  «Открыть TO BE…», B1 обе ветки, B3, B5).
- #627 `w4_tobe_current_fix_check.mjs` — **EXIT=0** (все инварианты).
- md5 AS IS `54211b88a54d62500e999341179f0f60` — неизменён.
- E7 + bpmn round-trip — 7/7; frontend unit — 77/77 (как baseline).
- ⚠️ `ol1_walkthrough.mjs` — критерии 1–6 зелёные, падение на recipe publish
  **422 — pre-existing** (воспроизводится и на build до изменений; бэкенд,
  кандидат в отдельный контур/E7).

## Среда: важные заметки

- Локальный API `127.0.0.1:8011` (docker `processmap_v1-api-1`, монтирует
  `/opt/processmap-test/backend`) — код от **2026-07-16**, БЕЗ `process_layer`
  в API и без `process-templates/*`. НЕ использовать для приёмки UXF.
- Реальный stage `https://stage.processmap.ru` — актуальный бэкенд
  (process_layer, import-bpmn). Приёмка UXF — только против него.
- Токены раздельные: `/tmp/.stage_token` — реальный stage;
  `/tmp/.stage_token_local8011` — локальный контейнер.

## Б2.6 чистка дублей — BLOCKED (RBAC)

Перечень одобрен владельцем (38 сессий `to_be`, derived от `13f1f10b20`,
все без XML, проект c0494e0667 на реальном stage). Удаление через
`DELETE /api/sessions/{id}` — **HTTP 403**: у `technologist-demo@local`
`permissions.delete=false`. Нужен аккаунт с правом delete (владелец):
команда-однострочник приложена в финальном сообщении; UI-путь — меню сессии
в шапке → удалить.

## Отклонения

1. Recipe publish 422 (pre-existing backend) — блокирует «полный прогон пути
   владельца EXIT=0» (критерий 7) на последнем шаге.
2. Локальный контейнер 8011 устарел — приёмка перенесена на реальный stage.
