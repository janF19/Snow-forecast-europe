# EPCI snapshot operations

## Coolify application settings

- Repository: `janF19/Snow-forecast-europe`
- Branch: `main`
- Build pack: Dockerfile
- Persistent storage name: `powder-forecast-data`
- Destination path: `/app/data`
- Runtime environment: `DATA_DIR=/app/data`
- Disable repository auto-deploy for weather commits; the validated weather workflow hook
  is the sole automatic trigger.

## First-capture verification

Open the application terminal after a validated weather deployment and run:

```sh
test "$DATA_DIR" = /app/data
test -d /app/data/forecast_snapshots
find /app/data/forecast_snapshots -maxdepth 1 -name '*.jsonl' -type f -print
wc -l /app/data/forecast_snapshots/*.jsonl
```

Record the deployed commit, issue time, file name, line count, and startup capture event.

## Same-release restart verification

Before restart, record `sha256sum /app/data/forecast_snapshots/*.jsonl`. Restart the same
Coolify deployment, record the hash again, and require the startup event `duplicate` with
`written:0`. Hashes and line counts must remain equal.

## Next-weather-batch verification

After the next validated weather commit/deploy, require the old rows to remain, the line
count to increase, and exactly one additional issue time to appear.

## Host-side backup

```sh
set -eu
VOLUME="$(docker volume ls --format '{{.Name}}' | grep 'powder-forecast-data' | head -n 1)"
test -n "$VOLUME"
BACKUP_DIR=/data/backups/powder-forecast
mkdir -p "$BACKUP_DIR"
docker run --rm -v "$VOLUME":/volume:ro -v "$BACKUP_DIR":/backup busybox \
  tar czf "/backup/epci-snapshots-$(date -u +%Y%m%dT%H%M%SZ).tar.gz" -C /volume .
ls -lh "$BACKUP_DIR"/epci-snapshots-*.tar.gz
```

Do not restore over the live volume. Stop the application and use a separately reviewed
recovery procedure that restores into a new volume, validates every JSONL line, then swaps
the mount.

## Rollback and malformed-data escalation

Application rollback selects the prior Coolify image and leaves the volume mounted.
Never delete, truncate, rewrite, or roll back snapshot rows. If capture reports
`invalid_existing_snapshot`, keep the forecast serving, collect the file/hash/error line,
and request a separate recovery review.

## Manual compromised-lock recovery (operator action only)

Do not perform this procedure during startup and do not automate it. When a stale or
compromised `.capture.lock` requires separately authorized recovery: stop all replicas;
inspect exactly `/app/data/forecast_snapshots/.capture.lock` and its `owner.json`; remove
only that exact lock directory; restart one replica; then verify one capture and that no
duplicate rows were appended. Do not delete any other storage path or snapshot data.
