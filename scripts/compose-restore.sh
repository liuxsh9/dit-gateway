#!/usr/bin/env bash
set -euo pipefail

BACKUP_PATH="${1:-${DIT_GATEWAY_RESTORE_BACKUP:-}}"
CONFIRM_TEXT="I_UNDERSTAND_THIS_DESTROYS_COMPOSE_VOLUMES"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 2
  fi
}

verify_checksums() {
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$BACKUP_PATH" && sha256sum -c checksums.sha256)
  else
    (cd "$BACKUP_PATH" && shasum -a 256 -c checksums.sha256)
  fi
}

need docker
need tar
need python3

if [ "${DIT_GATEWAY_RESTORE_CONFIRM:-}" != "$CONFIRM_TEXT" ]; then
  echo "refusing restore; set DIT_GATEWAY_RESTORE_CONFIRM=$CONFIRM_TEXT" >&2
  exit 2
fi
if [ -z "$BACKUP_PATH" ] || [ ! -d "$BACKUP_PATH" ]; then
  echo "backup directory is required as argv[1] or DIT_GATEWAY_RESTORE_BACKUP" >&2
  exit 2
fi
for file in forgejo.dump dit.dump forgejo-data.tar.gz core-data.tar.gz checksums.sha256; do
  if [ ! -f "$BACKUP_PATH/$file" ]; then
    echo "backup is missing $file: $BACKUP_PATH" >&2
    exit 1
  fi
done

verify_checksums

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

echo "stopping and removing compose services and volumes"
docker compose down -v

echo "starting database only"
docker compose up -d db

echo "waiting for database health"
for _ in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U forgejo >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker compose exec -T db pg_isready -U forgejo >/dev/null

echo "restoring Forgejo database"
docker compose exec -T db pg_restore --clean --if-exists --no-owner -U forgejo -d forgejo < "$BACKUP_PATH/forgejo.dump"

echo "restoring Dit database"
docker compose exec -T db pg_restore --clean --if-exists --no-owner -U forgejo -d dit < "$BACKUP_PATH/dit.dump"

echo "recreating data volumes"
docker volume create "$FORGEJO_VOLUME" >/dev/null
docker volume create "$CORE_VOLUME" >/dev/null

docker run --rm \
  -v "${FORGEJO_VOLUME}:/volume" \
  -v "$BACKUP_PATH:/backup:ro" \
  alpine:3.20 \
  sh -c 'tar -xzf /backup/forgejo-data.tar.gz -C /volume'

docker run --rm \
  -v "${CORE_VOLUME}:/volume" \
  -v "$BACKUP_PATH:/backup:ro" \
  alpine:3.20 \
  sh -c 'tar -xzf /backup/core-data.tar.gz -C /volume'

echo "starting full stack"
docker compose up -d

echo "restore complete"
