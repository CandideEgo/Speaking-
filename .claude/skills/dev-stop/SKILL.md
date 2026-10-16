---
name: dev-stop
description: Stop the Speaking dev services on Windows (backend, cloud Celery, GPU worker, frontend). Pass --infra to also stop the Docker containers.
disable-model-invocation: true
---

# Speaking Dev — stop

Takes down the four native Windows services. **Leaves the Postgres + Redis containers running** —
those go down only with `--infra`.

## Steps

1. **Free the app ports.** Read and run
   `C:/Users/Administrator/Speaking/.claude/reference/kill-ports.md`. Done when its last line printed
   `all app ports free`.

2. **Only if the user passed `--infra`**, also stop the containers:
   ```bash
   docker compose -f docker-compose.dev.yml down
   ```
   Do not add `-v`. `-v` removes the named volume holding the local database — that is an
   unrecoverable local data loss, not a cleanup step.

## Report

```
=== Speaking — services stopped ===
  Backend / Frontend / Cloud Celery / GPU Worker → down
  Docker (db + redis) → <running | stopped --infra>
```

## Stop signals

Stop and ask the user instead of pressing on:

- `--infra` was not requested but you are reaching for `docker compose ... down` anyway. The
  containers are cheap to leave up and expensive to reason about if something else was using them.
- Any flag beyond `down` — `-v`, `--rmi`, or a direct `docker volume rm`. Those delete state, and the
  local database has been wiped this way before.
- Steps that reach past local dev: the remote host, the deploy scripts, or anything on the GPU
  machine. Killing local ports does not authorize touching those.
