FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Persisted outside the image so data survives container restarts/rebuilds
VOLUME ["/app/storage"]
ENV MESHDIFF_STORAGE_ROOT=/app/storage
ENV MESHDIFF_DB_PATH=/app/storage/meshdiff.db

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

