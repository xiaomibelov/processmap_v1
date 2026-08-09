# EXEC REPORT — hotfix/stage-canvas-blank (PR #702)

Дата: 2026-08-09. Ветка: `hotfix/stage-canvas-blank` от `origin/main` @ ae34dd6d (merge #701).

## Инцидент

Stage после merge PR #701 (PROCESSMAN redesign PR-1): пустой канвас,
тулбар жив, диаграмма не рендерится.

## Корень (доказан воспроизведением)

При редизайне `ProcessmanPanel.jsx` (commit 423d2f09) потерян
`import "./processman.css";`. В этом файле — не только стили панели, но и
`.pm-processman-layout` / `.pm-processman-layout__canvas` — flex-обёртка
диаграммы, смонтированная ВСЕГДА (не только при открытой панели).
Без CSS layout рабочей области рассыпался → канвас схлопывался, тулбар
(вне обёртки) оставался жив.

**Почему не поймали тесты**: `node --test` (SSR/jsdom) не применяет
CSS-layout; source-тесты проверяли логику, не импорт стилей. Воспроизведение
потребовало production build + реальный браузер (playwright + vite preview).

### Отклонённые гипотезы (из брифа)

- остаточный import удалённого SchemaAssistantBlock — НЕТ (grep чист, build зелёный)
- крэш processmanChatStore на init — НЕТ (стор чистый, тесты зелёные)
- i18n-ключ кидает исключение — НЕТ (parity-тест зелёный)
- undefined проп в ProcessmanPanel — НЕТ (дефолты в сигнатуре)

## Фикс (commit d0d2b270, +58/−0, 4 файла)

1. `ProcessmanPanel.jsx`: возвращён `import "./processman.css";`
2. `ProcessmanErrorBoundary.jsx` (новый): сбой рендера панели → `null`
   (console.error), канвас сохраняется
3. `ProcessStage.jsx`: панель обёрнута в `<ProcessmanErrorBoundary>`
4. `processmanChatActions.source.test.mjs`: +2 регрессионных source-теста
   (импорт css обязателен; boundary на месте)

## Проверки

- processman-контур: **58/58 PASS** (включая 2 новых source-теста)
- esbuild-парс изменённых JSX: OK
- полный suite: 2928 тестов, 61 fail — идентичен baseline origin/main (0 новых)
- **Ручной smoke на production build** (vite build + preview — как stage-билд,
  playwright + chrome): схема открыта (canvas 1484×686, shapes=1), панель
  styled 380px (шапка/чип/onboarding/empty state/quick actions/composer),
  вопрос отправлен (user msg в ленте), канвас не перекрыт.
  Скриншоты: /tmp/smoke-1-canvas.png, /tmp/smoke-2-panel.png, /tmp/smoke-3-question.png.

## Урок

- CSS-импорты — часть контракта компонента: при переписи файла сохранять
  все side-effect импорты. Покрыто регрессионным source-тестом.
- Layout-обёртка канваса не должна зависеть от CSS дочерней панели
  (кандидат на PR-2/refactor: вынести `.pm-processman-layout*` в app-css).
