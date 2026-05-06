#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# --- Terminal UI helpers ---

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()   { error "$@"; exit 1; }

confirm() {
    local msg="$1" default="${2:-y}"
    if [ "$default" = "y" ]; then
        echo -en "${CYAN}?${NC} ${msg} ${DIM}[Y/n]${NC}: "
    else
        echo -en "${CYAN}?${NC} ${msg} ${DIM}[y/N]${NC}: "
    fi
    read -r REPLY || true
    [ -z "$REPLY" ] && REPLY="$default"
    [[ "$REPLY" =~ ^[Yy] ]]
}

separator() {
    echo -e "${DIM}─────────────────────────────────────────${NC}"
}

# --- Preflight ---

check_prerequisites() {
    if ! command -v docker &>/dev/null; then
        die "Docker is not installed."
    fi
    if ! docker compose version &>/dev/null; then
        die "Docker Compose V2 is not available."
    fi
    if ! command -v git &>/dev/null; then
        die "git is not installed."
    fi
    if [ ! -f .env ]; then
        die "No .env found. Run setup.sh first."
    fi
    if [ ! -f docker-compose.yml ]; then
        die "Not in dit-gateway project directory."
    fi
}

# --- Version detection ---

current_version() {
    if grep -q '^GATEWAY_IMAGE=' .env 2>/dev/null; then
        grep '^GATEWAY_IMAGE=' .env | sed 's/.*://'
    else
        git describe --tags --abbrev=0 2>/dev/null || echo "unknown"
    fi
}

latest_remote_version() {
    git fetch --tags --quiet 2>/dev/null || true
    git tag -l 'v*' --sort=-version:refname | head -1
}

image_strategy() {
    if grep -q '^GATEWAY_IMAGE=' .env 2>/dev/null; then
        echo "prebuilt"
    else
        echo "source"
    fi
}

# --- Backup ---

run_backup() {
    if [ -z "${DIT_GATEWAY_BACKUP_DIR:-}" ]; then
        local default_backup="/var/backups/dit-gateway"
        echo -en "${CYAN}?${NC} Backup directory ${DIM}[${default_backup}]${NC}: "
        read -r REPLY || true
        [ -z "$REPLY" ] && REPLY="$default_backup"
        export DIT_GATEWAY_BACKUP_DIR="$REPLY"
    fi

    info "Creating pre-upgrade backup..."
    bash "$SCRIPT_DIR/compose-backup.sh"
    info "Backup complete."
}

# --- Upgrade logic ---

upgrade_prebuilt() {
    local target_tag="$1"
    local owner="liuxsh9"

    info "Updating .env image tags to ${target_tag}..."
    sed -i.bak "s|^GATEWAY_IMAGE=.*|GATEWAY_IMAGE=ghcr.io/${owner}/dit-gateway:${target_tag}|" .env
    sed -i.bak "s|^CORE_IMAGE=.*|CORE_IMAGE=ghcr.io/${owner}/dit-core:${target_tag}|" .env
    rm -f .env.bak

    info "Pulling new images..."
    set -a; source .env; set +a
    docker compose pull gateway core
}

upgrade_source() {
    local target_tag="$1"

    info "Checking out ${target_tag}..."
    git checkout "$target_tag"

    local core_dir="${PROJECT_DIR}/../dit"
    if [ -d "$core_dir/.git" ]; then
        info "Updating dit-core source..."
        (cd "$core_dir" && git fetch --tags --quiet && git checkout "$target_tag" 2>/dev/null || git pull origin main)
    fi
}

restart_services() {
    set -a; source .env 2>/dev/null || true; set +a

    local profile_args=""
    if grep -q '^ROOT_URL=https' .env 2>/dev/null; then
        profile_args="--profile tls"
    fi

    local strategy
    strategy=$(image_strategy)

    if [ "$strategy" = "prebuilt" ]; then
        info "Restarting services with new images..."
        docker compose $profile_args up --no-build -d --remove-orphans
    else
        info "Rebuilding and restarting services..."
        docker compose $profile_args up --build -d --remove-orphans
    fi
}

health_check() {
    local port
    port=$(grep '^GATEWAY_PORT=' .env 2>/dev/null | cut -d= -f2 || echo "3000")
    [ -z "$port" ] && port="3000"

    info "Waiting for services to become healthy..."
    local retries=60
    while [ $retries -gt 0 ]; do
        if curl -fsS "http://localhost:${port}/api/v1/version" &>/dev/null; then
            break
        fi
        retries=$((retries - 1))
        sleep 5
    done

    if [ $retries -eq 0 ]; then
        error "Services did not become healthy within 5 minutes."
        docker compose ps
        docker compose logs --tail=30
        return 1
    fi

    info "All services healthy."
    docker compose ps
}

# --- Main ---

main() {
    echo ""
    echo -e "${BOLD}  DIT Gateway - Upgrade${NC}"
    echo ""
    separator

    check_prerequisites

    local current latest strategy
    current=$(current_version)
    latest=$(latest_remote_version)
    strategy=$(image_strategy)

    echo ""
    echo -e "  Current version:  ${CYAN}${current}${NC}"
    echo -e "  Latest available: ${CYAN}${latest:-none found}${NC}"
    echo -e "  Image strategy:   ${CYAN}${strategy}${NC}"
    echo ""

    if [ -z "$latest" ]; then
        die "Could not determine latest version. Check network and git remote."
    fi

    if [ "$current" = "$latest" ]; then
        info "Already running the latest version (${current}). Nothing to do."
        exit 0
    fi

    separator
    echo ""

    if ! confirm "Upgrade from ${current} to ${latest}?"; then
        info "Upgrade cancelled."
        exit 0
    fi

    echo ""

    # Step 1: Backup
    if confirm "Create a backup before upgrading?"; then
        run_backup
        separator
        echo ""
    else
        warn "Skipping backup. Data loss is possible if upgrade fails."
        echo ""
    fi

    # Step 2: Pull new version
    if [ "$strategy" = "prebuilt" ]; then
        upgrade_prebuilt "$latest"
    else
        upgrade_source "$latest"
    fi

    separator
    echo ""

    # Step 3: Restart
    restart_services

    # Step 4: Health check
    echo ""
    if health_check; then
        separator
        echo ""
        info "Upgrade complete: ${current} → ${latest}"
        echo ""
    else
        separator
        echo ""
        error "Upgrade may have failed. Services are not healthy."
        warn "To rollback, restore from backup:"
        echo ""
        echo "  DIT_GATEWAY_RESTORE_CONFIRM=I_UNDERSTAND_THIS_DESTROYS_COMPOSE_VOLUMES \\"
        echo "  ./scripts/compose-restore.sh <backup-path>"
        echo ""
        exit 1
    fi
}

main "$@"
