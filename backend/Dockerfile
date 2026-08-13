# ---- Stage 1: builder ----
FROM python:3.12.12-slim AS builder

WORKDIR /app

# ffmpeg is the only runtime system dependency (audio decode for transcription).
# Playwright/Chromium were removed when the Douyin/Bilibili platform modules were
# dropped — the image no longer ships a headless browser.
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
    apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ && \
    pip install --no-cache-dir -r requirements.txt

# Pre-download faster-whisper base model to avoid download on every container restart
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base')"

# Pre-download WhisperX alignment model for English (~360MB)
RUN python -c "import whisperx; whisperx.load_align_model(language_code='en', device='cpu')" || \
    echo "Warning: alignment model pre-download failed, will download on first use"

COPY . .

# ---- Stage 2: runtime ----
FROM python:3.12.12-slim

WORKDIR /app

# Non-root runtime user (least privilege — the app must not run as root).
RUN useradd --create-home --uid 1000 app

# Runtime system libraries: ffmpeg only (audio decode on the GPU worker).
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
    apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Whisper model cache (pre-downloaded in the builder under /root) lives under
# the app user's HOME so it stays readable AND writable (runtime downloads for
# missing models fall back here).
ENV HF_HOME=/home/app/.cache/huggingface \
    TRANSFORMERS_CACHE=/home/app/.cache/huggingface \
    XDG_CACHE_HOME=/home/app/.cache
COPY --from=builder /root/.cache/huggingface /home/app/.cache/huggingface

# Copy application code
COPY --from=builder /app /app
RUN chown -R app:app /app /home/app

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
