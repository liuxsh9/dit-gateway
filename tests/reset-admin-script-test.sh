#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT_DIR/scripts/reset-admin.sh"

assert_contains() {
    local file="$1"
    local expected="$2"
    if ! grep -Fq -- "$expected" "$file"; then
        echo "Expected to find: $expected" >&2
        echo "--- $file ---" >&2
        cat "$file" >&2
        exit 1
    fi
}

run_case() {
    local scenario="$1"
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    cat >"$tmp_dir/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

log="${RESET_ADMIN_TEST_LOG:?}"
scenario="${RESET_ADMIN_TEST_SCENARIO:?}"
printf '%q ' "$@" >>"$log"
printf '\n' >>"$log"

if [ "$*" = "compose version" ]; then
    printf 'Docker Compose version v2.0.0\n'
    exit 0
fi

if [ "$1 $2" != "compose exec" ]; then
    echo "unexpected docker command: $*" >&2
    exit 2
fi

shift 2
if [ "${1:-}" = "-T" ]; then
    shift
fi
if [ "${1:-}" = "--user" ]; then
    [ "${2:-}" = "git" ] || exit 5
    shift 2
fi

service="${1:-}"
shift
[ "$service" = "gateway" ] || exit 3

if [ "$*" = "forgejo admin user list --admin" ]; then
    printf 'ID   Username   Email\n'
    printf '1    sys        sys@example.com\n'
    exit 0
fi

case "$scenario:$*" in
    "create:forgejo admin user create --username sys --email sys@example.com --password test-password --admin --must-change-password=false")
        printf "New user 'sys' has been successfully created!\n"
        exit 0
        ;;
    "exists:forgejo admin user create --username sys --email sys@example.com --password test-password --admin --must-change-password=false")
        printf "user already exists\n" >&2
        exit 1
        ;;
    "exists:forgejo admin user change-password --username sys --password test-password --must-change-password=false")
        printf "sys's password has been successfully updated!\n"
        exit 0
        ;;
esac

echo "unexpected command for $scenario: $*" >&2
exit 4
STUB
    chmod +x "$tmp_dir/docker"

    if ! RESET_ADMIN_TEST_LOG="$tmp_dir/docker.log" \
        RESET_ADMIN_TEST_SCENARIO="$scenario" \
        PATH="$tmp_dir:$PATH" \
        ADMIN_USER=sys \
        ADMIN_EMAIL=sys@example.com \
        ADMIN_PASSWORD=test-password \
        "$SCRIPT" >"$tmp_dir/stdout" 2>"$tmp_dir/stderr"; then
        echo "--- stdout ---" >&2
        cat "$tmp_dir/stdout" >&2
        echo "--- stderr ---" >&2
        cat "$tmp_dir/stderr" >&2
        exit 1
    fi

    assert_contains "$tmp_dir/docker.log" "compose exec -T --user git gateway forgejo admin user create --username sys --email sys@example.com --password test-password --admin --must-change-password=false"
    assert_contains "$tmp_dir/docker.log" "compose exec -T --user git gateway forgejo admin user list --admin"

    if [ "$scenario" = "exists" ]; then
        assert_contains "$tmp_dir/docker.log" "compose exec -T --user git gateway forgejo admin user change-password --username sys --password test-password --must-change-password=false"
        assert_contains "$tmp_dir/stdout" "password reset"
    else
        assert_contains "$tmp_dir/stdout" "created"
    fi
}

run_case create
run_case exists

echo "reset-admin script tests passed"
