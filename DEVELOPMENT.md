# Development Guide

## Prerequisites

- Go 1.23+
- Node.js 22+
- Docker and Docker Compose
- PostgreSQL 16 (or use the Docker service)

---

## Local Development (without full Docker)

Run each component in a separate terminal for fast iteration.

**Terminal 1 — PostgreSQL (Docker)**
```bash
cd ~/code/datahub-gateway
docker compose up db
```

**Terminal 2 — datahub-core**
```bash
cd ~/code/datahub
pip install -e ".[server]"
export DATABASE_URL="postgresql+asyncpg://datahub:datahub@localhost:5432/datahub"
export DATA_DIR="./data/objects"
uvicorn dit.server.app:app --reload --port 8000
```

**Terminal 3 — datahub-gateway (Forgejo)**
```bash
cd ~/code/datahub-gateway
make watch
```

Gateway available at http://localhost:3000
Core API available at http://localhost:8000

---

## Full Stack (Docker Compose)

```bash
cd ~/code/datahub-gateway

# First time: copy and configure environment
cp .env.example .env
# Edit .env — set SERVICE_TOKEN and POSTGRES_PASSWORD

# Build and start all services
docker compose up --build

# In background
docker compose up --build -d

# View logs
docker compose logs -f

# Stop and remove containers (keep volumes)
docker compose down

# Stop and remove everything including volumes (full reset)
docker compose down -v
```

Services:
- Gateway: http://localhost:3000
- Core API: http://localhost:8000 (internal only, exposed for debugging)

---

## Common Commands

| Command | Description |
|---------|-------------|
| `docker compose up db` | Start only PostgreSQL |
| `docker compose up --build` | Build and start all services |
| `docker compose down -v` | Full teardown including volumes |
| `docker compose ps` | Check service health status |
| `docker compose logs core` | View datahub-core logs |
| `docker compose logs gateway` | View gateway logs |
| `go test ./modules/datahub/...` | Run datahub Go unit tests |
| `make watch` | Start gateway with hot reload |

---

## Database Access

```bash
# Connect to forgejo database
docker compose exec db psql -U forgejo forgejo

# Connect to datahub database
docker compose exec db psql -U datahub datahub

# List all databases
docker compose exec db psql -U forgejo -c "\l"
```

---

## Environment Variables

See `.env.example` for all required variables.

| Variable | Description |
|----------|-------------|
| `SERVICE_TOKEN` | Shared secret between gateway and core for internal API calls |
| `POSTGRES_PASSWORD` | Password for the `forgejo` PostgreSQL superuser |
