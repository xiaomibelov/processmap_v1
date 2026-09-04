# syntax=docker/dockerfile:1
# Многостадийная сборка: export-стадия (torch+transformers, только билд) готовит
# model_int8.onnx + tokenizer.json; рантайм-стадия — lean (onnxruntime+tokenizers,
# без torch/transformers). Модель скачивается ТОЛЬКО на этапе сборки.

FROM python:3.12-slim AS exporter

ENV PYTHONUNBUFFERED=1 \
    HF_HUB_OFFLINE=0

WORKDIR /build

# CPU-only torch: дефолтный aarch64-wheel тянет CUDA-стек (~3-4 GB), скачивание
# в docker-desktop VM стабильно замирает. GPU в compose не используется.
RUN pip install --no-cache-dir --timeout 30 --retries 10 \
      torch --index-url https://download.pytorch.org/whl/cpu
# --timeout/--retries: docker-desktop VM NAT периодически замирает на длинных
# скачиваниях; без read-timeout pip висит бесконечно.
COPY export-requirements.txt ./
RUN pip install --no-cache-dir --timeout 30 --retries 10 -r export-requirements.txt

COPY export_onnx.py ./
RUN python export_onnx.py /models


FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    HF_HUB_OFFLINE=1 \
    EMBEDDINGS_MODEL_DIR=/models

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --timeout 30 --retries 10 -r requirements.txt

COPY --from=exporter /models /models
COPY main.py ./

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
