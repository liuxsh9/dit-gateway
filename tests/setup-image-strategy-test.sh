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
}

test_open_registration_access_policy() {
    run_access_policy '2\n' >/dev/null

    [ "$ACCESS_POLICY" = "Open self-service registration" ]
    [ "$DISABLE_REGISTRATION" = "false" ]
    [ "$REQUIRE_SIGNIN_VIEW" = "false" ]
}

test_login_required_access_policy() {
    run_access_policy '3\n' >/dev/null

    [ "$ACCESS_POLICY" = "Login-required workspace" ]
    [ "$DISABLE_REGISTRATION" = "true" ]
    [ "$REQUIRE_SIGNIN_VIEW" = "true" ]
}

test_default_release_images() {
    run_image_strategy '1\n\n' >/dev/null

    [ "$BUILD_FROM_SOURCE" = false ]
    [ "$GATEWAY_IMAGE" = "ghcr.io/liuxsh9/dit-gateway:v0.1.0" ]
    [ "$CORE_IMAGE" = "ghcr.io/liuxsh9/dit-core:v0.1.0" ]
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

test_private_team_access_policy
test_open_registration_access_policy
test_login_required_access_policy
test_default_release_images
test_custom_release_tag
test_custom_images

echo "setup wizard option tests passed"
