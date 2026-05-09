#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_SCRIPT="$(mktemp)"
trap 'rm -f "$TEST_SCRIPT"' EXIT
sed 's/^main "$@"$/# main disabled for tests/' "$ROOT_DIR/scripts/setup.sh" > "$TEST_SCRIPT"

# shellcheck source=/dev/null
source "$TEST_SCRIPT"

strip_ansi() {
    sed -E 's/\x1B\[[0-9;]*[A-Za-z]//g'
}

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

run_image_strategy() {
    local input="$1"
    local input_file output_file
    input_file="$(mktemp)"
    output_file="$(mktemp)"
    printf '%b' "$input" > "$input_file"
    configure_image_strategy < "$input_file" > "$output_file" 2>&1
    strip_ansi < "$output_file"
    rm -f "$input_file" "$output_file"
}

run_access_policy() {
    local input="$1"
    local input_file output_file
    input_file="$(mktemp)"
    output_file="$(mktemp)"
    printf '%b' "$input" > "$input_file"
    configure_access_policy < "$input_file" > "$output_file" 2>&1
    strip_ansi < "$output_file"
    rm -f "$input_file" "$output_file"
}

test_private_team_access_policy() {
    run_access_policy '1\n' >/dev/null

    [ "$ACCESS_POLICY" = "Private team workspace" ]
    [ "$DISABLE_REGISTRATION" = "true" ]
    [ "$REQUIRE_SIGNIN_VIEW" = "false" ]
    [ "$USER_REPO_CREATION_LIMIT" = "0" ]
    [ "$ALLOW_USER_ORG_CREATION" = "false" ]
    [ "$DISABLE_REGULAR_ORG_CREATION" = "true" ]
}

test_open_registration_access_policy() {
    run_access_policy '2\n' >/dev/null

    [ "$ACCESS_POLICY" = "Open self-service registration" ]
    [ "$DISABLE_REGISTRATION" = "false" ]
    [ "$REQUIRE_SIGNIN_VIEW" = "false" ]
    [ "$USER_REPO_CREATION_LIMIT" = "0" ]
    [ "$ALLOW_USER_ORG_CREATION" = "false" ]
    [ "$DISABLE_REGULAR_ORG_CREATION" = "true" ]
}

test_login_required_access_policy() {
    run_access_policy '3\n' >/dev/null

    [ "$ACCESS_POLICY" = "Login-required workspace" ]
    [ "$DISABLE_REGISTRATION" = "true" ]
    [ "$REQUIRE_SIGNIN_VIEW" = "true" ]
    [ "$USER_REPO_CREATION_LIMIT" = "0" ]
    [ "$ALLOW_USER_ORG_CREATION" = "false" ]
    [ "$DISABLE_REGULAR_ORG_CREATION" = "true" ]
}

test_default_release_images() {
    run_image_strategy '1\n\n' >/dev/null

    [ "$BUILD_FROM_SOURCE" = false ]
    [ "$GATEWAY_IMAGE" = "ghcr.io/liuxsh9/dit-gateway:${DEFAULT_IMAGE_TAG}" ]
    [ "$CORE_IMAGE" = "ghcr.io/liuxsh9/dit-core:${DEFAULT_IMAGE_TAG}" ]
}

test_custom_release_tag() {
    run_image_strategy '1\nv0.1.1\n' >/dev/null

    [ "$BUILD_FROM_SOURCE" = false ]
    [ "$GATEWAY_IMAGE" = "ghcr.io/liuxsh9/dit-gateway:v0.1.1" ]
    [ "$CORE_IMAGE" = "ghcr.io/liuxsh9/dit-core:v0.1.1" ]
}

test_custom_images() {
    run_image_strategy '3\nregistry.example/gateway:dev\nregistry.example/core:dev\n' >/dev/null

    [ "$BUILD_FROM_SOURCE" = false ]
    [ "$GATEWAY_IMAGE" = "registry.example/gateway:dev" ]
    [ "$CORE_IMAGE" = "registry.example/core:dev" ]
}

test_create_admin_user_executes_as_git() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    cat >"$tmp_dir/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

printf '%q ' "$@" >>"${SETUP_TEST_DOCKER_LOG:?}"
printf '\n' >>"${SETUP_TEST_DOCKER_LOG:?}"

if [ "$*" = "compose exec -T --user git gateway forgejo admin user create --username sys --email sys@example.com --password test-password --admin --must-change-password=false" ]; then
    printf "New user 'sys' has been successfully created!\n"
    exit 0
fi

echo "unexpected docker command: $*" >&2
exit 1
STUB
    chmod +x "$tmp_dir/docker"

    ADMIN_USER=sys \
    ADMIN_EMAIL=sys@example.com \
    ADMIN_PASSWORD=test-password \
    SETUP_TEST_DOCKER_LOG="$tmp_dir/docker.log" \
    PATH="$tmp_dir:$PATH" \
    create_admin_user >/dev/null

    grep -Fq "compose exec -T --user git gateway forgejo admin user create" "$tmp_dir/docker.log"
}

test_deploy_prebuilt_stops_when_paired_image_pull_fails() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    cat >"$tmp_dir/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

printf '%q ' "$@" >>"${SETUP_TEST_DOCKER_LOG:?}"
printf '\n' >>"${SETUP_TEST_DOCKER_LOG:?}"

if [ "$*" = "compose pull gateway core" ]; then
    printf 'manifest unknown\n' >&2
    exit 1
fi

if [ "$*" = "compose up --no-build -d" ]; then
    printf 'compose up should not run after pull failure\n' >&2
    exit 10
fi

echo "unexpected docker command: $*" >&2
exit 2
STUB
    chmod +x "$tmp_dir/docker"

    set +e
    (
        cd "$tmp_dir"
        cat >.env <<'ENV'
GATEWAY_PORT=3000
GATEWAY_IMAGE=ghcr.io/liuxsh9/dit-gateway:v0.1.6
CORE_IMAGE=ghcr.io/liuxsh9/dit-core:v0.1.6
ENV
        GATEWAY_PORT=3000 \
        USE_TLS=false \
        SETUP_TEST_DOCKER_LOG="$tmp_dir/docker.log" \
        PATH="$tmp_dir:$PATH" \
        deploy_services >"$tmp_dir/stdout" 2>"$tmp_dir/stderr"
    )
    status=$?
    set -e

    if [ "$status" -eq 0 ]; then
        echo "deploy_services unexpectedly succeeded" >&2
        exit 1
    fi
    assert_contains "$tmp_dir/docker.log" "compose pull gateway core"
    if grep -Fq "compose up --no-build -d" "$tmp_dir/docker.log"; then
        echo "docker compose up ran after image pull failure" >&2
        exit 1
    fi
}

test_private_team_access_policy
test_open_registration_access_policy
test_login_required_access_policy
test_default_release_images
test_custom_release_tag
test_custom_images
test_create_admin_user_executes_as_git
test_deploy_prebuilt_stops_when_paired_image_pull_fails

echo "setup wizard option tests passed"
