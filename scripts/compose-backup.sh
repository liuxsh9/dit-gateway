#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="${DIT_GATEWAY_BACKUP_DIR:-}"
BACKUP_NAME="${DIT_GATEWAY_BACKUP_NAME:-dit-gateway-$(date -u +%Y%m%dT%H%M%SZ)}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 2
  fi
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$@"
  else
    shasum -a 256 "$@"
  fi
}

need docker
need tar
need python3

if [ -z "$BACKUP_ROOT" ]; then
  echo "DIT_GATEWAY_BACKUP_DIR is required" >&2
  exit 2
fi

DEST="${BACKUP_ROOT%/}/$BACKUP_NAME"
if [ -e "$DEST" ]; then
  echo "backup destination already exists: $DEST" >&2
  exit 1
fi
mkdir -p "$DEST"

BACKUP_COMPLETE=0
cleanup_incomplete_backup() {
  if [ "$BACKUP_COMPLETE" != "1" ]; then
    rm -rf "$DEST"
  fi
}

RESTART_ON_EXIT=0
restart_services() {
  if [ "$RESTART_ON_EXIT" = "1" ]; then
    echo "restarting services"
    docker compose start core gateway >/dev/null 2>&1 || true
  fi
}
on_exit() {
  restart_services
  cleanup_incomplete_backup
}
trap on_exit EXIT

volume_name() {
  docker compose config --format json | python3 -c '
import json
import sys

target = sys.argv[1]
cfg = json.load(sys.stdin)
volume = cfg.get("volumes", {}).get(target, {})
print(volume.get("name") or target)
' "$1"
}

FORGEJO_VOLUME="$(volume_name forgejo-data)"
CORE_VOLUME="$(volume_name core-data)"

echo "stopping write-facing services for a consistent backup"
docker compose stop gateway core
RESTART_ON_EXIT=1

echo "dumping Forgejo database"
docker compose exec -T db pg_dump -U forgejo -Fc forgejo > "$DEST/forgejo.dump"

echo "dumping Dit database"
docker compose exec -T db pg_dump -U forgejo -Fc dit > "$DEST/dit.dump"

echo "archiving Forgejo data volume"
docker run --rm \
  -v "${FORGEJO_VOLUME}:/volume:ro" \
  -v "$DEST:/backup" \
  alpine:3.20 \
  tar -czf /backup/forgejo-data.tar.gz -C /volume .

echo "archiving core object volume"
docker run --rm \
  -v "${CORE_VOLUME}:/volume:ro" \
  -v "$DEST:/backup" \
  alpine:3.20 \
  tar -czf /backup/core-data.tar.gz -C /volume .

(
  cd "$DEST"
  sha256_file forgejo.dump dit.dump forgejo-data.tar.gz core-data.tar.gz > checksums.sha256
)

python3 - "$DEST/manifest.json" "$BACKUP_NAME" "$FORGEJO_VOLUME" "$CORE_VOLUME" <<'PY'
import json
import subprocess
import sys
from datetime import datetime, timezone

def git_commit():
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        return None

manifest = {
    "created_at": datetime.now(timezone.utc).isoformat(),
    "backup_name": sys.argv[2],
    "volumes": {
        "forgejo-data": sys.argv[3],
        "core-data": sys.argv[4],
    },
    "git_commit": git_commit(),
    "files": [
        "forgejo.dump",
        "dit.dump",
        "forgejo-data.tar.gz",
        "core-data.tar.gz",
        "checksums.sha256",
    ],
}
with open(sys.argv[1], "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2, sort_keys=True)
    f.write("\n")
PY

restart_services
RESTART_ON_EXIT=0

BACKUP_COMPLETE=1
echo "backup complete: $DEST"
