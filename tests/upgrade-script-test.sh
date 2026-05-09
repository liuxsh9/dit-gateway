#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_SCRIPT="$(mktemp)"
trap 'rm -f "$TEST_SCRIPT"' EXIT
sed 's/^main "$@"$/# main disabled for tests/' "$ROOT_DIR/scripts/upgrade.sh" > "$TEST_SCRIPT"

# shellcheck source=/dev/null
source "$TEST_SCRIPT"

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

with_fake_docker() {
    local scenario="$1"
    local tmp_dir="$2"

    cat >"$tmp_dir/docker" <<STUB
#!/usr/bin/env bash
set -euo pipefail

printf '%q ' "\$@" >>"\${UPGRADE_TEST_DOCKER_LOG:?}"
printf '\n' >>"\${UPGRADE_TEST_DOCKER_LOG:?}"

scenario="$scenario"

if [ "\$*" = "compose images gateway --format {{.Repository}}:{{.Tag}}" ]; then
    printf 'ghcr.io/liuxsh9/dit-gateway:v0.1.4\n'
    exit 0
fi

if [ "\$1 \$2" = "compose pull" ]; then
    case "\$scenario" in
        pull-success)
            [ "\${GATEWAY_IMAGE:-}" = "ghcr.io/liuxsh9/dit-gateway:v0.1.5" ] || exit 3
            [ "\${CORE_IMAGE:-}" = "ghcr.io/liuxsh9/dit-core:v0.1.5" ] || exit 4
            [ "\$*" = "compose pull gateway core" ] || exit 5
            exit 0
            ;;
        pull-fail)
            printf 'manifest unknown\n' >&2
            exit 1
            ;;
    esac
fi

echo "unexpected docker command: \$*" >&2
exit 2
STUB
    chmod +x "$tmp_dir/docker"
}

with_fake_git_tags() {
    local tmp_dir="$1"

    cat >"$tmp_dir/git" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

printf '%q ' "$@" >>"${UPGRADE_TEST_GIT_LOG:?}"
printf '\n' >>"${UPGRADE_TEST_GIT_LOG:?}"

if [ "$*" = "fetch --tags --quiet" ]; then
    exit 0
fi

if [ "$*" = "tag -l v0.* --sort=-version:refname" ]; then
    printf 'v0.1.6\nv0.1.5\nv0.1.4\n'
    exit 0
fi

if [ "$*" = "tag -l v* --sort=-version:refname" ]; then
    printf 'v15.0.0\nv14.0.0\nv0.1.6\nv0.1.5\n'
    exit 0
fi

echo "unexpected git command: $*" >&2
exit 2
STUB
    chmod +x "$tmp_dir/git"
}

test_latest_available_version_ignores_upstream_forgejo_tags() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN
    with_fake_git_tags "$tmp_dir"

    PATH="$tmp_dir:$PATH" \
    UPGRADE_TEST_GIT_LOG="$tmp_dir/git.log" \
    latest_available_version >"$tmp_dir/latest"

    grep -Fxq "v0.1.6" "$tmp_dir/latest"
    assert_contains "$tmp_dir/git.log" "tag -l v0.\\* --sort=-version:refname"
}

test_current_running_version_prefers_actual_container_image() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN
    with_fake_docker pull-success "$tmp_dir"

    (
        cd "$tmp_dir"
        cat >.env <<'ENV'
GATEWAY_IMAGE=ghcr.io/liuxsh9/dit-gateway:v0.1.5
CORE_IMAGE=ghcr.io/liuxsh9/dit-core:v0.1.5
ENV
        PATH="$tmp_dir:$PATH" \
        UPGRADE_TEST_SCENARIO=pull-success \
        UPGRADE_TEST_DOCKER_LOG="$tmp_dir/docker.log" \
        current_running_version >"$tmp_dir/version"
    )

    grep -Fxq "v0.1.4" "$tmp_dir/version"
}

test_prebuilt_upgrade_updates_env_after_pull_success() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN
    with_fake_docker pull-success "$tmp_dir"

    (
        cd "$tmp_dir"
        cat >.env <<'ENV'
GATEWAY_IMAGE=ghcr.io/liuxsh9/dit-gateway:v0.1.4
CORE_IMAGE=ghcr.io/liuxsh9/dit-core:v0.1.4
ENV
        PATH="$tmp_dir:$PATH" \
        UPGRADE_TEST_SCENARIO=pull-success \
        UPGRADE_TEST_DOCKER_LOG="$tmp_dir/docker.log" \
        upgrade_prebuilt v0.1.5 >/dev/null
    )

    assert_contains "$tmp_dir/docker.log" "compose pull gateway core"
    assert_contains "$tmp_dir/.env" "GATEWAY_IMAGE=ghcr.io/liuxsh9/dit-gateway:v0.1.5"
    assert_contains "$tmp_dir/.env" "CORE_IMAGE=ghcr.io/liuxsh9/dit-core:v0.1.5"
}

test_prebuilt_upgrade_keeps_env_when_pull_fails() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN
    with_fake_docker pull-fail "$tmp_dir"

    set +e
    (
        cd "$tmp_dir"
        cat >.env <<'ENV'
GATEWAY_IMAGE=ghcr.io/liuxsh9/dit-gateway:v0.1.4
CORE_IMAGE=ghcr.io/liuxsh9/dit-core:v0.1.4
ENV
        PATH="$tmp_dir:$PATH" \
            UPGRADE_TEST_SCENARIO=pull-fail \
            UPGRADE_TEST_DOCKER_LOG="$tmp_dir/docker.log" \
            upgrade_prebuilt v0.1.5 >"$tmp_dir/stdout" 2>"$tmp_dir/stderr"
    )
    status=$?
    set -e
    if [ "$status" -eq 0 ]; then
        echo "upgrade_prebuilt unexpectedly succeeded" >&2
        exit 1
    fi

    assert_contains "$tmp_dir/.env" "GATEWAY_IMAGE=ghcr.io/liuxsh9/dit-gateway:v0.1.4"
    assert_contains "$tmp_dir/.env" "CORE_IMAGE=ghcr.io/liuxsh9/dit-core:v0.1.4"
}

test_latest_available_version_ignores_upstream_forgejo_tags
test_current_running_version_prefers_actual_container_image
test_prebuilt_upgrade_updates_env_after_pull_success
test_prebuilt_upgrade_keeps_env_when_pull_fails

echo "upgrade script tests passed"
