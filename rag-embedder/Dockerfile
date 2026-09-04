FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    HF_HUB_OFFLINE=0

WORKDIR /app

COPY requirements.txt ./
# CPU-only torch: дефолтный aarch64-wheel тянет CUDA-стек (nvidia-*, cuda-toolkit,
# ~3-4 GB), скачивание в docker-desktop VM стабильно замирает. GPU в compose не
# используется (нет runtime: nvidia) — CPU-сборки достаточно для e5-small.
RUN pip install --no-cache-dir --timeout 30 --retries 10 \
      torch --index-url https://download.pytorch.org/whl/cpu
# --timeout/--retries: docker-desktop VM NAT периодически замирает на длинных
# скачиваниях; без read-timeout pip висит бесконечно.
RUN pip install --no-cache-dir --timeout 30 --retries 10 -r requirements.txt

COPY main.py ./

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
