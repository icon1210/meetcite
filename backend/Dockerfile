# API image: FastAPI + WeasyPrint. No GPU needed here.
FROM python:3.11-slim

# WeasyPrint needs Pango for PDF export; FFmpeg reads uploads (in cloud mode the API also runs the jobs).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt weasyprint==63.1

COPY . .
RUN useradd --create-home meetcite && mkdir -p /data && chown meetcite /data
USER meetcite

EXPOSE 8000
# Apply database migrations, then start the API.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
