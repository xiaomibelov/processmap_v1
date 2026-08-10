"""LLM-генератор API-тестов по данным покрытия (контур test/llm-test-generator).

Пайплайн на операцию из OpenAPI-спеки:
1. Отбор цели из build/api-coverage-results.json (not_covered/partial, приоритет
   read-only GET → whitelist POST), минус исключения exclusions.yaml.
2. Сбор контекста: фрагмент живой спеки с $ref-резолвом, образцы тестов,
   доступные фикстуры, непокрытые варианты (documented − seen).
3. Генерация теста LLM (проектный OpenAI-compatible клиент, модель параметром).
4. Гейты: py_compile → статик-запреты (AST) → изолированный pytest-прогон.
   Падение → traceback обратно в LLM (макс. 3 итерации) → needs_human.md.

Судья качества — реальный прогон pytest, не самооценка модели.
"""
