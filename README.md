# DIT Gateway

DIT Gateway is a Forgejo-based Web and collaboration layer for Dit data repositories. It keeps the normal Forgejo account, repository, permission, and UI model, while data repos store SFT dataset objects in `dit-core`.

## Architecture

| Component | Default URL | Purpose |
|-----------|-------------|---------|
| PostgreSQL | `db:5432` | Forgejo DB plus the `dit` database used by core |
| dit-core | `http://core:8000` | FastAPI data-versioning API |
| gateway | `http://localhost:3000` | Forgejo UI/API with data repo integration |

Gateway talks to core with `X-Service-Token`. The gateway `[datahub] SERVICE_TOKEN` value must match core `DIT_SERVER_SERVICE_TOKEN`.

## Prerequisites

- Linux server (Ubuntu 22.04+, Debian 12+, or similar)
- Docker Engine 24+ with Compose V2
- At least 2 GB RAM and 20 GB disk
- 1-3 ports available (depending on deployment mode)

## Quick Deploy

```bash
git clone https://github.com/liuxsh9/dit-gateway.git
cd dit-gateway
sudo ./scripts/setup.sh
```

The interactive wizard guides you through:

1. **Deployment mode** — HTTP only (1 port), HTTP+SSH (2 ports), or HTTPS+SSH (3 ports, needs domain)
2. **Port configuration** — choose which ports to expose based on your server constraints
3. **Access URL** — server IP/hostname or domain for TLS
4. **Admin account** — username, email, auto-generated or custom password
5. **Access policy** — admin-managed users, open registration, or login-required browsing
6. **Image strategy** — pull release images by tag, build from source, or enter custom images

After completion, the script starts all services, creates the admin account,
installs a systemd unit for auto-start on reboot, and runs health verification.

### Manual Deploy

If you prefer manual control over the setup process:

```bash
cp .env.example .env
# Edit .env — fill in SERVICE_TOKEN, SECRET_KEY, POSTGRES_PASSWORD, DIT_DB_PASSWORD
# Generate secrets with: openssl rand -base64 32

docker compose up --build -d
docker compose exec gateway forgejo admin user create \
  --username sys --email sys@example.com \
  --random-password --random-password-length 24 \
  --admin --must-change-password=false
```

See `.env.example` for all available options (ports, SSH, TLS domain, pre-built image).
The setup wizard defaults to release images tagged `v0.1.0`. To choose another
release without typing full image names, run:

```bash
DIT_IMAGE_TAG=v0.1.1 sudo ./scripts/setup.sh
```

### TLS with Custom Domain

Set in `.env`:

```bash
DOMAIN=data.example.com
ROOT_URL=https://data.example.com/
```

```bash
docker compose --profile tls up -d
```

Caddy auto-provisions a Let's Encrypt certificate. Ensure ports 80 and 443 are
open on the firewall.

### Health Checks

```bash
curl -fsS http://localhost:3000/api/v1/version   # gateway
curl -fsS http://localhost:8000/health            # core
```

## Client Setup

Install the [dit CLI](https://github.com/liuxsh9/dit) on developer machines (requires Python 3.12+ and [uv](https://docs.astral.sh/uv/)):

```bash
uv pip install git+https://github.com/liuxsh9/dit.git
```

Connect to your gateway:

```bash
dit remote add origin http://<your-server>:3000/<owner>/<repo>.dit
dit auth set-token <token> --remote origin
```

Tokens are created by the site admin via the gateway Web UI (user Settings > Applications).

Basic workflow:

```bash
dit init
dit add train.jsonl
dit commit -m "initial dataset"
dit push
```

See the [dit README](https://github.com/liuxsh9/dit) for full CLI documentation.

## Upgrade

```bash
./scripts/compose-backup.sh
git pull
docker compose up --build -d
docker compose ps
```

If health checks fail after upgrade, restore from backup:

```bash
DIT_GATEWAY_RESTORE_CONFIRM=I_UNDERSTAND_THIS_DESTROYS_COMPOSE_VOLUMES \
./scripts/compose-restore.sh <backup-path>
```

Database migrations run automatically on startup via Forgejo's auto-migrate
and core's Alembic.

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

## Deployment Acceptance

Before moving a server into use:

- `docker compose ps` shows `db`, `core`, and `gateway` healthy.
- `curl http://localhost:8000/health` returns core `status: healthy`.
- `curl http://localhost:3000/api/v1/version` returns HTTP 200.
- Admin account exists and public registration is disabled.
- Systemd unit is enabled (`systemctl is-enabled dit-gateway`).
- Creating a gateway data repo also creates the backing core repo.
- The repository UI stays English even when the browser language is Chinese.
- Pushing a small JSONL dataset through `dit` succeeds.
- A backup and restore drill has been completed.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Data repo creation fails | core URL or service token mismatch | Check `FORGEJO__datahub__CORE_URL`, `FORGEJO__datahub__SERVICE_TOKEN`, and core `DIT_SERVER_SERVICE_TOKEN` |
| Gateway ignores `[datahub]` env vars | wrong Dockerfile or entrypoint | Build with root `Dockerfile` |
| SQLite driver missing | build tags omitted | Use `TAGS='bindata sqlite sqlite_unlock_notify'` |
| UI shows stale assets | frontend bundle not rebuilt | Run `NODE_ENV=development npx webpack` before backend build, or use Docker |
| Core starts but API fails with missing tables | migration did not run | Check core logs; core Docker image auto-runs Alembic unless `DIT_SERVER_AUTO_MIGRATE=0` |

## Reference

<details>
<summary>Gateway environment variables</summary>

`docker-compose.yml` sets these through Forgejo's `FORGEJO__section__KEY` convention:

```bash
FORGEJO__security__INSTALL_LOCK=true
FORGEJO__security__SECRET_KEY=${SECRET_KEY}
FORGEJO__datahub__ENABLED=true
FORGEJO__datahub__CORE_URL=http://core:8000
FORGEJO__datahub__SERVICE_TOKEN=${SERVICE_TOKEN}
FORGEJO__i18n__LANGS=en-US
FORGEJO__i18n__NAMES=English
FORGEJO__server__DISABLE_SSH=${DISABLE_SSH}
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

</details>

<details>
<summary>Build from source (non-Docker)</summary>

Use the root `Dockerfile` for Docker deployment. For local builds with SQLite:

```bash
NODE_ENV=development npx webpack
TAGS='bindata sqlite sqlite_unlock_notify' make backend
```

Do not use `Dockerfile.datahub`; it is deprecated and fails fast intentionally.

</details>

<details>
<summary>Admin account notes</summary>

- `SERVICE_TOKEN` is the gateway-to-core service secret, not a user password.
- Choose `Private team workspace` in setup for production unless there is an explicit onboarding process.
- Choose `Open self-service registration` only when users should register themselves at `/user/sign_up`.
- Choose `Login-required workspace` when anonymous visitors should not browse public pages.
- Keep the `sys` account for emergency administration only. Use separate named accounts for daily work.
- To require password change on handoff, use `--must-change-password=true`.

</details>

See also:

- Core deployment guide: `../datahub/docs/deployment.md`
- Local development guide: `DEVELOPMENT.md`
