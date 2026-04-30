# DIT Gateway

DIT Gateway is a Forgejo-based Web and collaboration layer for Dit data repositories. It keeps the normal Forgejo account, repository, permission, and UI model, while data repos store SFT dataset objects in `dit-core`.

## Architecture

| Component | Default URL | Purpose |
|-----------|-------------|---------|
| PostgreSQL | `db:5432` | Forgejo DB plus the `dit` database used by core |
| dit-core | `http://core:8000` | FastAPI data-versioning API |
| gateway | `http://localhost:3000` | Forgejo UI/API with data repo integration |

Gateway talks to core with `X-Service-Token`. The gateway `[datahub] SERVICE_TOKEN` value must match core `DIT_SERVER_SERVICE_TOKEN`.

## Quick Docker Deploy

This repository expects the core repository next to it:

```text
/path/to/datahub
/path/to/datahub-gateway
```

Create `.env`:

```bash
cp .env.example .env
```

Fill in:

```bash
SERVICE_TOKEN=<generate-a-long-random-secret>
POSTGRES_PASSWORD=<generate-a-db-password>
DIT_DB_PASSWORD=<generate-a-dit-db-password>
```

Build and start:

```bash
docker compose up --build -d
docker compose ps
```

Create the first site administrator from the gateway container:

```bash
docker compose exec gateway forgejo admin user create \
  --username sys \
  --email sys@example.com \
  --random-password \
  --random-password-length 24 \
  --admin \
  --must-change-password=false
```

The command prints the generated password once. Store it in the production
password manager before continuing.

Health checks:

```bash
curl -fsS http://localhost:3000/api/healthz
curl -fsS http://localhost:8000/health
```

Full smoke from the core repo:

```bash
cd ../datahub
CORE_URL=http://localhost:8000 \
GATEWAY_URL=http://localhost:3000 \
./scripts/deployment-smoke.sh
```

## Required Gateway Config

`docker-compose.yml` sets these through Forgejo's `FORGEJO__section__KEY` environment convention:

```bash
FORGEJO__datahub__ENABLED=true
FORGEJO__datahub__CORE_URL=http://core:8000
FORGEJO__datahub__SERVICE_TOKEN=${SERVICE_TOKEN}
FORGEJO__i18n__LANGS=en-US
FORGEJO__i18n__NAMES=English
```

Equivalent `app.ini`:

```ini
[i18n]
LANGS = en-US
NAMES = English

[datahub]
ENABLED = true
CORE_URL = http://core:8000
SERVICE_TOKEN = <same-as-core>
```

DIT Gateway defaults to English-only UI terminology so inherited Forgejo pages and DIT pages use the same GitHub-style labels: `Issues`, `Pull requests`, `Actions`, `Security`, `Insights`, `Labels`, `Milestones`, `Assignees`, `Open`, `Closed`, and `Merged`.

## Initial Administrator Setup

Production deployments should bootstrap the first administrator with the
Forgejo CLI, not open public registration. The recommended first account is a
break-glass site administrator such as `sys`; create named daily-use
administrator and repository-owner accounts after the system is online.

For Docker Compose:

```bash
docker compose exec gateway forgejo admin user create \
  --username sys \
  --email sys@example.com \
  --random-password \
  --random-password-length 24 \
  --admin \
  --must-change-password=false
```

For a non-Docker deployment, point the same command at the production config
and work path:

```bash
./gitea migrate --config /path/to/app.ini --work-path /path/to/forgejo-data

./gitea admin user create \
  --config /path/to/app.ini \
  --work-path /path/to/forgejo-data \
  --username sys \
  --email sys@example.com \
  --random-password \
  --random-password-length 24 \
  --admin \
  --must-change-password=false
```

Notes:

- `SERVICE_TOKEN` is the gateway-to-core service secret. It is not the `sys`
  password and should not be used for user login.
- Keep `DISABLE_REGISTRATION=true` in production unless there is an explicit
  onboarding process for public signups.
- Keep the `sys` account for emergency administration only. Use separate named
  accounts for daily administration and repository ownership.
- If an operator should rotate the generated password during handoff, set
  `--must-change-password=true` instead.

## Build Notes

Use the root `Dockerfile` for deployment. It preserves Forgejo's official Docker entrypoint, bindata generation, SQLite build tags, and environment-to-`app.ini` wiring.

Do not use `Dockerfile.datahub`; it is intentionally deprecated and fails fast to prevent incomplete images.

For local non-Docker builds with SQLite:

```bash
NODE_ENV=development npx webpack
TAGS='bindata sqlite sqlite_unlock_notify' make backend
```

## Deployment Acceptance

Before moving a server into use:

- `docker compose ps` shows `db`, `core`, and `gateway` healthy.
- `curl http://localhost:8000/health` returns core `status: healthy`.
- `curl http://localhost:3000/api/healthz` returns HTTP 200.
- The first site administrator was created with `forgejo admin user create`
  and public registration is disabled unless intentionally enabled.
- Creating a gateway data repo also creates the backing core repo.
- The repository UI stays English even when the browser language is Chinese.
- Pushing a small ML 2.0 / OpenAI messages JSONL dataset through `dit` succeeds.
- The data repo page shows latest commit, row count, file size, metadata coverage, and quality checks.
- JSONL rows and diffs render as structured SFT conversations, not one raw JSON string.
- A backup and restore drill has been completed with `scripts/compose-backup.sh` and `scripts/compose-restore.sh`.

## Backup And Restore

Before upgrades or risky changes, take a consistent full-stack backup:

```bash
DIT_GATEWAY_BACKUP_DIR=/secure/backups/dit-gateway \
./scripts/compose-backup.sh
```

The backup contains Forgejo DB, Dit DB, Forgejo `/data`, and core object data. Restore is destructive and requires explicit confirmation:

```bash
DIT_GATEWAY_RESTORE_CONFIRM=I_UNDERSTAND_THIS_DESTROYS_COMPOSE_VOLUMES \
./scripts/compose-restore.sh /secure/backups/dit-gateway/dit-gateway-YYYYMMDDTHHMMSSZ
```

After restore, run:

```bash
cd ../datahub
CORE_URL=http://localhost:8000 \
GATEWAY_URL=http://localhost:3000 \
./scripts/deployment-smoke.sh
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Data repo creation fails | core URL or service token mismatch | Check `FORGEJO__datahub__CORE_URL`, `FORGEJO__datahub__SERVICE_TOKEN`, and core `DIT_SERVER_SERVICE_TOKEN` |
| Gateway ignores `[datahub]` env vars | wrong Dockerfile or entrypoint | Build with root `Dockerfile` |
| SQLite driver missing | build tags omitted | Use `TAGS='bindata sqlite sqlite_unlock_notify'` |
| UI shows stale assets | frontend bundle not rebuilt | Run `NODE_ENV=development npx webpack` before backend build, or use Docker |
| Core starts but API fails with missing tables | migration did not run | Check core logs; core Docker image auto-runs Alembic unless `DIT_SERVER_AUTO_MIGRATE=0` |

See also:

- Core deployment guide: `../datahub/docs/deployment.md`
- Local development guide: `DEVELOPMENT.md`
