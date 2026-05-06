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

prompt() {
    local msg="$1" default="${2:-}"
    if [ -n "$default" ]; then
        echo -en "${CYAN}?${NC} ${msg} ${DIM}[${default}]${NC}: "
    else
        echo -en "${CYAN}?${NC} ${msg}: "
    fi
    read -r REPLY || true
    [ -z "$REPLY" ] && REPLY="$default"
    return 0
}

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

select_option() {
    local prompt_msg="$1"
    shift
    local options=("$@")
    local count=${#options[@]}

    echo -e "${CYAN}?${NC} ${prompt_msg}"
    for i in "${!options[@]}"; do
        echo -e "  ${BOLD}$((i+1)))${NC} ${options[$i]}"
    done
    echo -en "  ${DIM}Enter choice [1-${count}]${NC}: "
    read -r REPLY || true
    while [[ ! "$REPLY" =~ ^[0-9]+$ ]] || [ "$REPLY" -lt 1 ] || [ "$REPLY" -gt "$count" ]; do
        echo -en "  ${RED}Invalid.${NC} Enter [1-${count}]: "
        read -r REPLY || true
    done
    SELECTED=$((REPLY - 1))
}

separator() {
    echo -e "${DIM}─────────────────────────────────────────${NC}"
}

DEFAULT_IMAGE_TAG="${DIT_IMAGE_TAG:-v0.1.0}"

deployment_mode_label() {
    case "$1" in
        0) echo "HTTP only" ;;
        1) echo "HTTP + SSH" ;;
        2) echo "HTTPS + SSH" ;;
        *) echo "unknown" ;;
    esac
}

# --- Preflight ---

check_prerequisites() {
    info "Checking prerequisites..."

    if ! command -v docker &>/dev/null; then
        die "Docker is not installed. Install it first: https://docs.docker.com/engine/install/"
    fi

    if ! docker compose version &>/dev/null; then
        die "Docker Compose V2 is not available. Update Docker or install the compose plugin."
    fi

    if ! docker info &>/dev/null 2>&1; then
        die "Docker daemon is not running, or current user lacks permission. Try: sudo systemctl start docker"
    fi

    info "Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+') with Compose $(docker compose version --short) ready."
}

# --- Interactive configuration wizard ---

configure_deployment() {
    echo ""
    echo -e "${BOLD}  DIT Gateway - Deployment Setup${NC}"
    echo ""
    separator

    # Step 1: Deployment mode
    echo ""
    echo -e "${BOLD}Step 1: Deployment Mode${NC}"
    echo ""
    select_option "Choose your deployment mode:" \
        "HTTP only       — 1 port  (web UI, git over HTTP)" \
        "HTTP + SSH      — 2 ports (web UI + git SSH clone/push)" \
        "HTTPS + SSH     — 3 ports (TLS via Caddy + git SSH, needs domain)"
    MODE=$SELECTED

    separator

    # Step 2: Port configuration
    echo ""
    echo -e "${BOLD}Step 2: Port Configuration${NC}"
    echo ""

    case $MODE in
        0)
            echo -e "  ${DIM}This mode requires 1 port for the web interface.${NC}"
            echo ""
            prompt "Web UI port" "3000"
            GATEWAY_PORT="$REPLY"
            DISABLE_SSH="true"
            SSH_EXPOSE=""
            SSH_PORT=""
            USE_TLS=false
            ;;
        1)
            echo -e "  ${DIM}This mode requires 2 ports: one for web, one for SSH.${NC}"
            echo ""
            prompt "Web UI port" "3000"
            GATEWAY_PORT="$REPLY"
            prompt "Git SSH port" "3001"
            SSH_PORT="$REPLY"
            SSH_EXPOSE="0.0.0.0:${SSH_PORT}"
            DISABLE_SSH="false"
            USE_TLS=false
            ;;
        2)
            echo -e "  ${DIM}This mode uses ports 80 + 443 (Caddy TLS) + 1 SSH port.${NC}"
            echo ""
            GATEWAY_PORT="3000"
            prompt "Git SSH port" "22"
            SSH_PORT="$REPLY"
            SSH_EXPOSE="0.0.0.0:${SSH_PORT}"
            DISABLE_SSH="false"
            USE_TLS=true
            ;;
    esac

    separator

    # Step 3: Domain / URL
    echo ""
    echo -e "${BOLD}Step 3: Access URL${NC}"
    echo ""

    if [ "$USE_TLS" = true ]; then
        prompt "Your domain name (Caddy will auto-provision TLS)" "data.example.com"
        DOMAIN="$REPLY"
        ROOT_URL="https://${DOMAIN}/"
    else
        echo -e "  ${DIM}How will users access this server? Enter the public/internal IP or hostname.${NC}"
        echo -e "  ${DIM}(Not 0.0.0.0 or 127.0.0.1 — those aren't reachable from other machines)${NC}"
        echo ""
        local default_host
        default_host=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
        prompt "Server IP or hostname" "$default_host"
        local host="$REPLY"
        while [ "$host" = "0.0.0.0" ] || [ "$host" = "127.0.0.1" ]; do
            warn "0.0.0.0 / 127.0.0.1 is a bind address, not a reachable address."
            warn "Enter the IP that other machines use to reach this server."
            prompt "Server IP or hostname" "$default_host"
            host="$REPLY"
        done
        if [ "$GATEWAY_PORT" = "80" ]; then
            ROOT_URL="http://${host}/"
        else
            ROOT_URL="http://${host}:${GATEWAY_PORT}/"
        fi
        DOMAIN="$host"
    fi

    separator

    # Step 4: Admin account
    echo ""
    echo -e "${BOLD}Step 4: Admin Account${NC}"
    echo ""
    prompt "Admin username" "sys"
    ADMIN_USER="$REPLY"
    prompt "Admin email" "${ADMIN_USER}@example.com"
    ADMIN_EMAIL="$REPLY"

    select_option "Password mode:" \
        "Auto-generate 24-char random password (recommended)" \
        "Set my own password"
    if [ $SELECTED -eq 0 ]; then
        ADMIN_PASSWORD=""
    else
        while true; do
            echo -en "${CYAN}?${NC} Enter password (min 8 chars): "
            read -rs ADMIN_PASSWORD || true
            echo ""
            if [ ${#ADMIN_PASSWORD} -lt 8 ]; then
                warn "Password must be at least 8 characters."
                continue
            fi
            echo -en "${CYAN}?${NC} Confirm password: "
            read -rs password_confirm || true
            echo ""
            if [ "$ADMIN_PASSWORD" != "$password_confirm" ]; then
                warn "Passwords do not match. Try again."
                continue
            fi
            break
        done
    fi

    separator

    configure_image_strategy

    separator

    # Summary
    echo ""
    echo -e "${BOLD}  Configuration Summary${NC}"
    echo ""
    echo -e "  Mode:        ${GREEN}$(deployment_mode_label "$MODE")${NC}"
    echo -e "  Web port:    ${GREEN}${GATEWAY_PORT}${NC}"
    [ -n "${SSH_PORT:-}" ] && echo -e "  SSH port:    ${GREEN}${SSH_PORT}${NC}" || true
    echo -e "  URL:         ${GREEN}${ROOT_URL}${NC}"
    echo -e "  Admin:       ${GREEN}${ADMIN_USER}${NC} <${ADMIN_EMAIL}>"
    [ -n "$GATEWAY_IMAGE" ] && echo -e "  Image:       ${GREEN}${GATEWAY_IMAGE} / ${CORE_IMAGE}${NC}" || echo -e "  Image:       ${GREEN}build from source${NC}"
    echo ""

    if ! confirm "Proceed with this configuration?"; then
        die "Setup cancelled."
    fi
}

configure_image_strategy() {
    echo ""
    echo -e "${BOLD}Step 5: Image Strategy${NC}"
    echo ""
    select_option "How to get the service images?" \
        "Pull release images  (recommended, fastest)" \
        "Build from source    (first build takes 10-20 min, no registry needed)" \
        "Use custom images    (advanced)"

    if [ $SELECTED -eq 0 ]; then
        prompt "Image tag" "$DEFAULT_IMAGE_TAG"
        local image_tag="$REPLY"
        GATEWAY_IMAGE="ghcr.io/liuxsh9/dit-gateway:${image_tag}"
        CORE_IMAGE="ghcr.io/liuxsh9/dit-core:${image_tag}"
        BUILD_FROM_SOURCE=false
    elif [ $SELECTED -eq 1 ]; then
        GATEWAY_IMAGE=""
        CORE_IMAGE=""
        BUILD_FROM_SOURCE=true

        # Check if dit (core) source is available for building
        local core_dir="${PROJECT_DIR}/../dit"
        if [ ! -d "$core_dir/src" ]; then
            echo ""
            warn "dit-core source not found at: $core_dir"
            info "Cloning dit repository for local build..."
            git clone https://github.com/liuxsh9/dit.git "$core_dir"
            if [ ! -d "$core_dir/src" ]; then
                die "Failed to clone dit repository. Check network access to github.com."
            fi
            info "dit-core source ready at: $core_dir"
        else
            info "dit-core source found at: $core_dir"
        fi
    else
        prompt "Gateway image" "ghcr.io/liuxsh9/dit-gateway:${DEFAULT_IMAGE_TAG}"
        GATEWAY_IMAGE="$REPLY"
        prompt "Core image" "ghcr.io/liuxsh9/dit-core:${DEFAULT_IMAGE_TAG}"
        CORE_IMAGE="$REPLY"
        BUILD_FROM_SOURCE=false
    fi
}

# --- Generate .env from wizard answers ---

generate_env_file() {
    if [ -f .env ] && [ "$FORCE" != true ]; then
        if confirm "Existing .env found. Overwrite with new configuration?" "n"; then
            info "Overwriting .env..."
        else
            info "Keeping existing .env."
            return 0
        fi
    fi

    info "Generating .env with random secrets..."

    local service_token secret_key pg_pass dit_pass
    service_token="$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)"
    secret_key="$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)"
    pg_pass="$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)"
    dit_pass="$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)"

    {
        echo "# Generated by setup.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "SERVICE_TOKEN=${service_token}"
        echo "SECRET_KEY=${secret_key}"
        echo "POSTGRES_PASSWORD=${pg_pass}"
        echo "DIT_DB_PASSWORD=${dit_pass}"
        echo ""
        echo "GATEWAY_PORT=${GATEWAY_PORT}"
        echo "ROOT_URL=${ROOT_URL}"
        echo "DOMAIN=${DOMAIN}"
        echo "DISABLE_SSH=${DISABLE_SSH}"
        [ -n "${SSH_PORT:-}" ] && echo "SSH_PORT=${SSH_PORT}" || true
        [ -n "${SSH_EXPOSE:-}" ] && echo "SSH_EXPOSE=${SSH_EXPOSE}" || true
        [ -n "${GATEWAY_IMAGE:-}" ] && echo "GATEWAY_IMAGE=${GATEWAY_IMAGE}" || true
        [ -n "${CORE_IMAGE:-}" ] && echo "CORE_IMAGE=${CORE_IMAGE}" || true
    } > .env

    chmod 600 .env
    info ".env created (permissions: 600)."
}

# --- Deploy ---

deploy_services() {
    set -a; source .env 2>/dev/null || true; set +a

    local profile_args=""
    if [ "$USE_TLS" = true ]; then
        profile_args="--profile tls"
        info "TLS profile enabled for domain: $DOMAIN"
    fi

    if [ -n "${GATEWAY_IMAGE:-}" ] || [ -n "${CORE_IMAGE:-}" ]; then
        info "Pulling pre-built service images..."
        docker compose $profile_args pull gateway core

        info "Starting services from pre-built images..."
        docker compose $profile_args up --no-build -d
    else
        info "Building and starting services (this may take a few minutes on first build)..."
        docker compose $profile_args up --build -d
    fi

    info "Waiting for services to become healthy..."
    local retries=60
    while [ $retries -gt 0 ]; do
        if curl -fsS "http://localhost:${GATEWAY_PORT}/api/v1/version" &>/dev/null; then
            break
        fi
        retries=$((retries - 1))
        sleep 5
    done

    if [ $retries -eq 0 ]; then
        error "Services did not become healthy within 5 minutes."
        docker compose ps
        docker compose logs --tail=20
        die "Deployment failed. Check logs above."
    fi

    info "All services healthy."
    docker compose ps
}

# --- Create admin user ---

create_admin_user() {
    info "Creating site administrator account..."

    local admin_output
    local password_args

    if [ -n "${ADMIN_PASSWORD:-}" ]; then
        password_args="--password $ADMIN_PASSWORD"
    else
        password_args="--random-password --random-password-length 24"
    fi

    admin_output=$(docker compose exec -T gateway forgejo admin user create \
        --username "$ADMIN_USER" \
        --email "$ADMIN_EMAIL" \
        $password_args \
        --admin \
        --must-change-password=false 2>&1) || true

    if echo "$admin_output" | grep -q "already exists"; then
        warn "Admin user '${ADMIN_USER}' already exists. Skipping."
    elif [ -n "${ADMIN_PASSWORD:-}" ]; then
        echo ""
        echo -e "${BOLD}============================================${NC}"
        echo -e "${BOLD}  ADMIN ACCOUNT CREATED${NC}"
        echo -e "${BOLD}============================================${NC}"
        echo -e "  Username: ${GREEN}${ADMIN_USER}${NC}"
        echo -e "  Password: ${GREEN}(as you entered)${NC}"
        echo -e "${BOLD}============================================${NC}"
        echo ""
    elif echo "$admin_output" | grep -qi "password"; then
        echo ""
        echo -e "${BOLD}============================================${NC}"
        echo -e "${BOLD}  ADMIN ACCOUNT CREATED${NC}"
        echo -e "${BOLD}============================================${NC}"
        echo "$admin_output" | grep -i "password"
        echo ""
        echo -e "  Username: ${GREEN}${ADMIN_USER}${NC}"
        echo -e "  ${RED}SAVE THIS PASSWORD NOW - it won't be shown again.${NC}"
        echo -e "${BOLD}============================================${NC}"
        echo ""
    else
        warn "Admin creation output: $admin_output"
    fi
}

# --- Systemd integration ---

install_systemd_unit() {
    if [ "$(id -u)" -ne 0 ]; then
        warn "Not running as root. Skipping systemd unit installation."
        warn "To enable auto-start on reboot, run: sudo $0 --systemd-only"
        return 0
    fi

    info "Installing systemd unit for auto-start on reboot..."

    cat > /etc/systemd/system/dit-gateway.service <<EOF
[Unit]
Description=DIT Gateway (Docker Compose)
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${PROJECT_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable dit-gateway.service
    info "Systemd unit installed and enabled."
}

# --- Health verification ---

verify_deployment() {
    info "Running deployment verification..."
    local errors=0

    if curl -fsS "http://localhost:${GATEWAY_PORT}/api/v1/version" &>/dev/null; then
        info "  Gateway health: OK"
    else
        error "  Gateway health: FAILED"
        errors=$((errors + 1))
    fi

    if docker compose exec -T db pg_isready -U forgejo &>/dev/null; then
        info "  PostgreSQL: OK"
    else
        error "  PostgreSQL: FAILED"
        errors=$((errors + 1))
    fi

    if docker compose exec -T core curl -fsS http://localhost:8000/health &>/dev/null; then
        info "  Core health: OK"
    else
        error "  Core health: FAILED"
        errors=$((errors + 1))
    fi

    if [ $errors -eq 0 ]; then
        echo ""
        info "Deployment successful! Access the gateway at:"
        info "  ${ROOT_URL}"
        [ "$DISABLE_SSH" = "false" ] && info "  SSH: ssh://git@${DOMAIN}:${SSH_PORT}/<owner>/<repo>.git"
        echo ""
    else
        die "Deployment verification failed with $errors error(s)."
    fi
}

# --- Main ---

main() {
    FORCE=false
    local systemd_only=false

    for arg in "$@"; do
        case "$arg" in
            --force) FORCE=true ;;
            --systemd-only) systemd_only=true ;;
            --help|-h)
                echo "Usage: $0 [--force] [--systemd-only]"
                echo ""
                echo "  --force         Overwrite existing .env file"
                echo "  --systemd-only  Only install the systemd unit (requires root)"
                echo ""
                echo "Interactive setup wizard for DIT Gateway deployment."
                echo "Guides you through mode selection, port configuration,"
                echo "and admin account creation."
                exit 0
                ;;
        esac
    done

    if [ "$systemd_only" = true ]; then
        install_systemd_unit
        exit 0
    fi

    echo ""
    echo -e "${BOLD}=========================================${NC}"
    echo -e "${BOLD}  DIT Gateway - Deployment Setup${NC}"
    echo -e "${BOLD}=========================================${NC}"
    echo ""

    check_prerequisites

    if [ "$FORCE" = true ] && [ -f .env ]; then
        rm -f .env
    fi

    configure_deployment
    generate_env_file
    deploy_services
    create_admin_user
    install_systemd_unit
    verify_deployment
}

main "$@"
