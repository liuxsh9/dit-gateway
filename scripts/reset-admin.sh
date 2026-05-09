#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

ADMIN_USER="${ADMIN_USER:-sys}"
ADMIN_EMAIL="${ADMIN_EMAIL:-${ADMIN_USER}@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
GATEWAY_SERVICE="${GATEWAY_SERVICE:-gateway}"
GATEWAY_EXEC_USER="${GATEWAY_EXEC_USER:-git}"

info()  { echo "[INFO] $*"; }
warn()  { echo "[WARN] $*" >&2; }
error() { echo "[ERROR] $*" >&2; }
die()   { error "$@"; exit 1; }

require_docker_compose() {
    command -v docker >/dev/null 2>&1 || die "docker is not available."
    docker compose version >/dev/null 2>&1 || die "docker compose is not available."
}

generate_password() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -base64 24 | tr -d '\n'
    else
        dd if=/dev/urandom bs=24 count=1 2>/dev/null | base64 | tr -d '\n'
    fi
}

compose_exec() {
    local exec_args=(-T)
    if [ -n "$GATEWAY_EXEC_USER" ]; then
        exec_args+=(--user "$GATEWAY_EXEC_USER")
    fi
    docker compose exec "${exec_args[@]}" "$GATEWAY_SERVICE" "$@"
}

admin_list_contains_user() {
    local list_output="$1"
    awk -v user="$ADMIN_USER" 'NR > 1 && $2 == user { found = 1 } END { exit(found ? 0 : 1) }' <<<"$list_output"
}

ensure_admin_user() {
    local password="$1"
    local tmp_output
    tmp_output="$(mktemp)"

    if compose_exec forgejo admin user create \
        --username "$ADMIN_USER" \
        --email "$ADMIN_EMAIL" \
        --password "$password" \
        --admin \
        --must-change-password=false >"$tmp_output" 2>&1; then
        info "Admin user '$ADMIN_USER' created."
    elif grep -qi "already exists" "$tmp_output"; then
        warn "User '$ADMIN_USER' already exists. Resetting password."
        compose_exec forgejo admin user change-password \
            --username "$ADMIN_USER" \
            --password "$password" \
            --must-change-password=false
        info "Admin user '$ADMIN_USER' password reset."
    else
        cat "$tmp_output" >&2
        rm -f "$tmp_output"
        die "Failed to create or update admin user '$ADMIN_USER'."
    fi

    local admin_users
    admin_users="$(compose_exec forgejo admin user list --admin)"
    rm -f "$tmp_output"
    if ! admin_list_contains_user "$admin_users"; then
        echo "$admin_users" >&2
        die "User '$ADMIN_USER' exists but is not an administrator. Pick a new ADMIN_USER or promote it manually from an existing admin account."
    fi
}

main() {
    require_docker_compose

    local generated_password=false
    if [ -z "$ADMIN_PASSWORD" ]; then
        ADMIN_PASSWORD="$(generate_password)"
        generated_password=true
    fi

    ensure_admin_user "$ADMIN_PASSWORD"

    echo ""
    echo "============================================"
    echo "  ADMIN ACCOUNT READY"
    echo "============================================"
    echo "  Username: $ADMIN_USER"
    if [ "$generated_password" = true ]; then
        echo "  Password: $ADMIN_PASSWORD"
        echo "  Save this password now. It will not be stored by this script."
    else
        echo "  Password: (as provided via ADMIN_PASSWORD)"
    fi
    echo "============================================"
}

main "$@"
