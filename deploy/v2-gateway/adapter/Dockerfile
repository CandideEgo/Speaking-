# Same Python runtime line as the existing cloud backend; no LiteLLM/provider SDK.
FROM python:3.12.12-slim@sha256:f3fa41d74a768c2fce8016b98c191ae8c1bacd8f1152870a3f9f87d350920b7c

WORKDIR /adapter
COPY requirements-runtime.txt ./
RUN python -m pip install --no-cache-dir -r requirements-runtime.txt && python -m pip check
COPY app.py content_receipts.py ./
RUN useradd --create-home --uid 1000 adapter
USER adapter
ENV PYTHONUTF8=1 PYTHONDONTWRITEBYTECODE=1
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "4000"]
