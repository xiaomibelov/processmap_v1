"""SessionOptions для onnxruntime sidecar'а (выделено из main.py для тестируемости).

Память: enable_mem_arena=False по умолчанию. Default-арена onnxruntime
кеширует освобождённые блоки под high-water mark и НЕ возвращает память ОС —
при последовательных /embed-запросах (celery-батчинг) RSS растёт до потолка
контейнера и уходит в OOM-цикл (stage 2026-09-15: 1.23→1.5 GiB → cgroup-OOM,
fix/stage-slow-load-auth-outage). Без арены malloc/free возвращают память.
"""
import os


def _env_flag(name: str, default: bool, env=None) -> bool:
    source = os.environ if env is None else env
    raw = str(source.get(name) or "").strip().lower()
    if not raw:
        return default
    return raw not in ("0", "false", "off", "no")


def build_session_options(environ=None) -> "object":
    """ort.SessionOptions с нашей политикой памяти/потоков.

    environ подменяется в тестах; по умолчанию — os.environ.
    """
    import onnxruntime as ort

    env = os.environ if environ is None else environ
    opts = ort.SessionOptions()
    # Арена CPU-аллокатора OFF по умолчанию (env EMBEDDINGS_ORT_MEM_ARENA=1
    # для обратного включения). Атрибут enable_cpu_mem_arena (ORT >= 1.16);
    # fallback — config-entry для старых версий.
    enable_arena = _env_flag("EMBEDDINGS_ORT_MEM_ARENA", False, env)
    if hasattr(opts, "enable_cpu_mem_arena"):
        opts.enable_cpu_mem_arena = enable_arena
    elif not enable_arena:
        opts.add_session_config_entry("session.enable_mem_arena", "0")
    threads = int(str(env.get("EMBEDDINGS_ORT_THREADS", "0") or "0") or 0)
    if threads > 0:
        opts.intra_op_num_threads = threads
    return opts


def max_batch_size(environ=None) -> int:
    """Потолок числа текстов в одном /embed-запросе (server-side защита)."""
    env = os.environ if environ is None else environ
    raw = str(env.get("EMBEDDINGS_MAX_BATCH", "128") or "128").strip()
    try:
        return max(1, int(raw))
    except ValueError:
        return 128
