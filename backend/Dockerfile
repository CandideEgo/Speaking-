# ---- Stage 1: builder ----
FROM python:3.12-slim AS builder

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
FROM python:3.12-slim

WORKDIR /app

# Runtime system libraries: ffmpeg only (audio decode on the GPU worker).
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
    apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy faster-whisper model cache from builder
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

# Copy application code
COPY --from=builder /app /app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
