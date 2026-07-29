FROM python:3.11-slim

ARG BUILD_ID=unknown
ARG BUILD_TIME=unknown
ARG BUILD_BRANCH=unknown
ARG BUILD_ENV=prod
ENV BUILD_ID=${BUILD_ID}
ENV BUILD_TIME=${BUILD_TIME}
ENV BUILD_BRANCH=${BUILD_BRANCH}
ENV BUILD_ENV=${BUILD_ENV}
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend

RUN mkdir -p /app/workspace/processes /app/workspace/.session_store

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
