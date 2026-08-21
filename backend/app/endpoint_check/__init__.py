"""Контур feature/endpoint-regression-scanner: регрессионный сканер эндпоинтов.

Прогон всех read-only (GET) эндпоинтов живого приложения по кнопке в админке
или после деплоя; результаты и дифф против прошлого прогона — в БД
(таблицы endpoint_check_runs / endpoint_check_results, см. storage._ensure_schema).
"""
