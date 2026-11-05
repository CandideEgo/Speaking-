#!/bin/sh
set -eu

: "${COMMANDCODE_MODEL:?COMMANDCODE_MODEL must be set}"
: "${COMMANDCODE_API_KEY:?COMMANDCODE_API_KEY must be set}"
: "${LITELLM_MASTER_KEY:?LITELLM_MASTER_KEY must be set}"
: "${LITELLM_DATABASE_URL:?LITELLM_DATABASE_URL must be set}"
: "${REDIS_GATEWAY_PASSWORD:?REDIS_GATEWAY_PASSWORD must be set}"

export V2_INPUT_COST_PER_TOKEN="${V2_INPUT_COST_PER_TOKEN:-0}"
export V2_OUTPUT_COST_PER_TOKEN="${V2_OUTPUT_COST_PER_TOKEN:-0}"
export V2_MAX_INPUT_TOKENS="${V2_MAX_INPUT_TOKENS:-4096}"
export V2_MAX_OUTPUT_TOKENS="${V2_MAX_OUTPUT_TOKENS:-128}"
export GATEWAY_REDIS_HOST="${GATEWAY_REDIS_HOST:-redis}"
export GATEWAY_REDIS_PORT="${GATEWAY_REDIS_PORT:-6379}"
export GATEWAY_REDIS_DB="${GATEWAY_REDIS_DB:-2}"
export LITELLM_DB_POOL_LIMIT="${LITELLM_DB_POOL_LIMIT:-10}"

python /spike/render_config.py /spike/config.prod.template.yaml /tmp/config.yaml

exec litellm \
  --config /tmp/config.yaml \
  --port 4000 \
  --num_workers "${GATEWAY_WORKERS:-2}" \
  --timeout_worker_healthcheck 300
