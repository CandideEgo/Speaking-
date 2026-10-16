# Free the app ports

The shared first step of every `/dev` and `/dev-stop` run: detect what is listening on the app
ports, kill it, and **verify the ports are actually free**.

Run the whole block. The last line MUST print `all app ports free`. If it does not, re-run the
block before doing anything else — starting on an occupied port is the #1 source of bugs here: a
zombie on 8000/3000, a stale `--reload` reloader silently serving old code, or the frontend quietly
falling back to 3001.

```bash
echo "=== listening on app ports ==="
netstat -ano | grep -E ':(8000|3000|3001) ' | grep LISTENING || echo "(none)"

# Kill by PID for each port (PID is column 5 of `netstat -ano`)
for port in 8000 3000 3001; do
  pids=$(netstat -ano | grep ":$port " | grep LISTENING | awk '{print $5}' | sort -u)
  for pid in $pids; do
    [ -n "$pid" ] && taskkill //PID $pid //F 2>/dev/null && echo "killed PID $pid on :$port"
  done
done
sleep 2

# Verify — fall back to clearing python.exe when an orphaned reloader lingers
if netstat -ano | grep -E ':(8000|3000|3001) ' | grep -q LISTENING; then
  # An orphaned --reload reloader parent keeps the port LISTENING under a stale PID that
  # taskkill already "killed" (cross-session orphan). See the trap below.
  echo "ports still occupied after PID kill — clearing all python.exe"
  taskkill //F //IM python.exe 2>/dev/null
  sleep 2
fi
netstat -ano | grep -E ':(8000|3000|3001) ' | grep LISTENING || echo "all app ports free"
```

## The orphaned `--reload` trap

`--reload` spawns a reloader parent plus a worker child. When a prior session's worker is killed but
the parent lingers, `netstat` can still show port 8000 LISTENING under a PID that `tasklist` reports
as "not found" — a stale socket held by a cross-session orphan. A new uvicorn then starts *behind*
the stale one, and code edits silently stop reloading: `/health` answers fine while the server keeps
serving the old routes (observed: a newly added route 404s despite the file being saved). That is
why this step verifies **free**, not merely **killed**.

## Symptom to read backwards

The frontend came up on **3001** instead of 3000 → port 3000 was still occupied. This step should
have caught it; re-run the block.

## Stop signal — the broad kill

`taskkill //F //IM python.exe` is the blunt fallback: it takes out every Python process on the
machine, including ones you did not start (a long-running script, the user's own REPL, another
project's worker). Confirm with the user before running it when other Python work may be live.
