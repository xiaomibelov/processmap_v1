# VERDICT.md — fix/llm-output-contract-residuals

## Контекст

- Ветка: `fix/llm-output-contract-residuals`
- База: `main` (`307effbb`, PR #843 вмержен)
- Stage: `https://stage.processmap.ru/`, commit `307effbb`
- Цель: устранить S1 (processman показывает сырой JSON envelope) и S2 (AI_RESPONSE_PARSE_ERROR на «Анализ LLM»).

## Симптомы и результаты

| Симптом | Root cause | Фикс | Файлы | Статус |
|---------|------------|------|-------|--------|
| S1: processman-лента показывает `{&quot;action&quot;:&quot;suggest-next&quot;,...}` | H4: `extractAnswerText` обрабатывал только `suggest`/`explain`/`qa`; для processman-аналогов `suggest-next`/`explain-step`/`step-qa` возвращал `""`, затирая текст сообщения | F4: добавлены ветки для `suggest-next`/`explain-step`/`step-qa` с теми же payload-полями, что и у `suggest`/`explain`/`qa` | `frontend/src/features/process/processman/processmanView.js` | ✅ реализовано, unit-тесты проходят |
| S2: «Анализ LLM» → AI_RESPONSE_PARSE_ERROR | На stage **не воспроизведён** после PR #843; execution log чистый, deepseek-v4-flash без fallback | Действий не требуется в этом контуре; оставляем defensive monitoring | — | ⚠️ не воспроизведён на stage |

## Почему сырой JSON мелькал

1. Пользователь в processman вводит smalltalk-запрос («расскажи анекдот»).
2. LLM отвечает JSON envelope `{"action":"suggest-next",...}` — backend стримит его как token-события.
3. UI добавляет эти токены к тексту сообщения → пользователь видит мелькающий/зависающий пузырь с `{&quot;action&quot;:...}`.
4. Backend распознаёт envelope и шлёт `event: action` с полным payload.
5. `ProcessmanTobe.jsx` вызывает `extractAnswerText("suggest-next", data)`, получает `""` и затирает накопленный текст пустой строкой.

После фикса п.5 возвращает структурированный текст (список кандидатов + note / explanation + note / answer + note), и сообщение перезаписывается корректным содержимым.

## Тесты

- `frontend/src/features/process/processman/processmanView.test.mjs` — добавлен тест `extractAnswerText: processman-аналоги suggest-next/explain-step/step-qa`.
- `frontend/src/features/process/processman/processmanStream.test.mjs` — без изменений (mapStreamEventToMessage уже корректно мапит action-типы).
- Запуск в Docker (`node:20-alpine`):
  - 20/21 тестов проходят.
  - 1 pre-existing failure: `cleanAgentError` ожидает старый `SA_ERROR_TEXTS.error` (`"Не удалось получить ответ"`), а в коде сейчас `"Ошибка при обращении к LLM — попробуйте ещё раз."`. Не относится к этому контуру; чинить не стали.

## Что осталось на пользователе

1. Смержить PR `fix/llm-output-contract-residuals` в `main`.
2. Задеплоить на stage.
3. Проверить вручную: открыть processman, выбрать шаг, ввести smalltalk-запрос → убедиться, что в ленте нет сырого JSON и после action event появляется структурированный ответ.
4. Если S2 (AI_RESPONSE_PARSE_ERROR) появится снова — собрать execution log с `module_id`, `provider_id`, `model`, полным `raw` и завести отдельный контур.

## Связанные артефакты

- `evidence/processman_sse_raw_envelope.txt` — захваченные SSE-фреймы.
- `evidence/execution_log_recent.json` — последние записи execution log.
- `evidence/product_actions_suggest_success.json` — успешный product-actions suggest.
- `evidence/llm_analysis_success.json` — успешный process analysis.
