FROM python:3.12-slim

WORKDIR /app

RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
    apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    # Playwright dependencies for Chromium
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    # Chinese fonts for Douyin rendering
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Install pytorch-lightning first (workaround for lightning package quarantine on PyPI)
RUN pip install pytorch-lightning>=2.0.1
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ && \
    pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers
RUN playwright install chromium

# Pre-download faster-whisper base model to avoid download on every container restart
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base')"

# Pre-download WhisperX alignment model for English (~360MB)
RUN python -c "import whisperx; whisperx.load_align_model(language_code='en', device='cpu')" || \
    echo "Warning: alignment model pre-download failed, will download on first use"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
