"""Async audit-log publisher for the hot save-path.

Контур perf/save-path-decoupling-v1 (P3): запись audit_log для
session.update уходит в Celery-очередь (паритет publish_session_saved),
чтобы синхронный INSERT не блокировал save-запрос.
"""
