# DataHub Gateway Dev Notes

This repo is a Forgejo-based gateway for DataHub dataset review flows. Treat it as a shared, multi-agent workspace: refresh the live state before editing, before validating browser behavior, and again before committing.

## Project Basics

- Repo: `/Users/lxs/code/datahub-gateway`
- Main remote: `origin` -> `https://github.com/liuxsh9/dit-gateway.git`
- Upstream Forgejo remote: `upstream` -> `https://codeberg.org/forgejo/forgejo.git`
- Common frontend entrypoint: `web_src/js/features/datahub.js`
- Main DataHub Vue components:
  - `web_src/js/components/DataRepoHome.vue`
  - `web_src/js/components/DataPreviewPage.vue`
  - `web_src/js/components/DataPullPage.vue`
  - `web_src/js/components/DataDiffView.vue`
  - `web_src/js/components/JsonlViewer.vue`
- DataHub templates are under `templates/repo/datahub/`.

## Shared Services

The expected local test gateway is on port `3003`:

```sh
/Users/lxs/code/datahub-gateway/gitea web \
  --config /Users/lxs/Documents/AI/datahub-e2e-20260428/config/app.ini \
  --work-path /Users/lxs/Documents/AI/datahub-e2e-20260428/forgejo-data
```

The service log is:

```text
/Users/lxs/Documents/AI/datahub-e2e-20260428/gitea-3003.log
```

Useful health checks:

```sh
curl -fsS http://127.0.0.1:3003/api/healthz
curl -fsS http://127.0.0.1:8000/health
```

Known sample repo:

```text
http://127.0.0.1:3003/e2e/sft-e2e-20260428
```

Known preview URL shape:

```text
/e2e/sft-e2e-20260428/data/preview/<commit>/<path-to-jsonl>
```

## Before Starting Work

Always refresh the multi-agent state:

```sh
git status --short --branch
git diff --stat
git remote -v
git branch -vv
git ls-remote --heads origin main
lsof -nP -iTCP:3003 -sTCP:LISTEN || true
curl -fsS http://127.0.0.1:3003/api/healthz
curl -fsS http://127.0.0.1:8000/health
```

Do not assume dirty files are yours. If unrelated files changed, leave them alone and mention them in the handoff.

## Frontend Build And Restart

Changing Vue or frontend assets requires rebuilding the `gitea` binary and restarting the `3003` process. Browser refresh alone is not enough.

To force browser asset cache busting for local uncommitted changes, use a temporary version suffix:

```sh
rm -f gitea public/assets/js/index.js public/assets/css/index.css
GITEA_VERSION='15.0.0-85-332147ddee-localfix' TAGS='bindata sqlite sqlite_unlock_notify' make build
```

Then restart `3003`:

```sh
old_pid=$(lsof -tiTCP:3003 -sTCP:LISTEN || true)
if [ -n "$old_pid" ]; then
  kill "$old_pid"
  while kill -0 "$old_pid" 2>/dev/null; do sleep 0.2; done
fi

nohup /Users/lxs/code/datahub-gateway/gitea web \
  --config /Users/lxs/Documents/AI/datahub-e2e-20260428/config/app.ini \
  --work-path /Users/lxs/Documents/AI/datahub-e2e-20260428/forgejo-data \
  > /Users/lxs/Documents/AI/datahub-e2e-20260428/gitea-3003.log 2>&1 &
```

After restart, check both the process and the version:

```sh
lsof -nP -iTCP:3003 -sTCP:LISTEN
./gitea --version | head -n 1
curl -fsS http://127.0.0.1:3003/api/healthz
```

If the first health check fails right after restart, do not assume the service is broken. Check `lsof` and tail the log first; the server can still be finishing startup.

## Browser Verification

Use the in-app browser / `@browser-use` for UI checks. Do not replace explicit browser-use requests with `open`, curl, or Playwright outside the in-app browser unless the user approves a fallback.

After a rebuild/restart:

- Reload the target page in the in-app browser.
- Confirm the page HTML/footer asset version includes the temporary suffix when cache-busting.
- Verify visible DOM behavior, not only API responses.

Useful page check:

```sh
curl -sS http://127.0.0.1:3003/e2e/sft-e2e-20260428 \
  | rg 'assetVersionEncoded|Version:|data-repo-home'
```

Important route detail:

- The Data home UI is mounted at the repo root page `http://127.0.0.1:3003/e2e/sft-e2e-20260428` in `#data-repo-home`.
- `/e2e/sft-e2e-20260428/data` is not the Data home route and can return 404.
- Data home content is async Vue content. Wait for `.datahub-file-table` or the specific row/link before concluding it did not render.

## Known Pitfalls

- Port `3003` being online does not prove it is running the latest local code. Check `./gitea --version` and the page asset version.
- Local uncommitted changes do not change `git describe`, so browser asset URLs may stay unchanged and keep stale JS. Use a temporary `GITEA_VERSION` suffix for test builds.
- The preview tree can load expanded folder state from session storage. When checking tree order, compare the relevant root-level rows or reload after clearing stale UI state if needed.
- Data home and preview may sort similar names differently if one side compares names with trailing `/`. Normalize directory names before comparing if aligning their behavior.
- Browser console may contain old errors from previous asset versions. Prefer current page DOM plus service logs for the active verification.
- Service logs can show transient database context-canceled errors during navigation/restart. Re-check the same API after the service settles before treating it as a root cause.

### Permission And Admin Bootstrap Checks

- Production bootstrap docs now live in `README.md`: create the first `sys` site admin with `forgejo admin user create`, keep `SERVICE_TOKEN` as a gateway/core service secret rather than a user password, and default compose deployments to `DISABLE_REGISTRATION=true`.
- For permission audits, create three fresh accounts with date-stamped names: one site admin, one repo admin collaborator, and one read-only repo collaborator. Use CLI-created Forgejo tokens for repeatable API checks; do not paste real token values into notes or commits.
- Public data repos are not enough to prove isolation. Also create a temporary private DataHub repo, add the same repo-admin/read collaborators, and verify anonymous plus unrelated authenticated users get `404` for both repository and `/api/v1/repos/{owner}/{repo}/datahub/...` routes.
- Sensitive DataHub writer endpoints should reject anonymous users with `401` and read-only users with `403`: `/refs`, `/objects/batch*`, `/pulls`, pull comments/reviews, `/meta/compute`, `/checks`, and `/gc`. `search` and `validate` behave like read/compute operations on public repos, but must still be hidden by private repo access checks.
- For PR governance UI, wait for `.datahub-pull-page` and the actual PR title before judging controls. The initial Vue shell can briefly show placeholder text. A read-only user should see the merge button disabled and write-access messaging; a repo admin should see manage/settings links and an enabled merge button when governance allows it.
- In zsh scripts, avoid naming a local variable `path`; zsh ties it to `PATH`, which can make basic tools like `tr` disappear mid-script.

Local permission audit fixtures from 2026-04-30:

```text
Password for all three codexperm users: CodexPerm-20260430104344-A1b2c3!

Site admin:
  username: codexperm20260430104344sys
  email: codexperm20260430104344sys@example.com
  Forgejo token: 7aefd40156d1cee312c1f463ffb9d50837c94e72

Repo admin collaborator:
  username: codexperm20260430104344repo
  email: codexperm20260430104344repo@example.com
  Forgejo token: 34d2bbc5ab338b2472d6eda4147acccfd5fb14a2

Read-only collaborator:
  username: codexperm20260430104344user
  email: codexperm20260430104344user@example.com
  Forgejo token: 2198d8f743ed2eb2da1d9d86f8b18b0260987418

Public audit repo:
  http://127.0.0.1:3003/e2e/sft-e2e-20260428

Temporary private audit repo:
  http://127.0.0.1:3003/codexperm20260430104344sys/perm-private-20260430104344

Audit evidence:
  /Users/lxs/Documents/AI/datahub-e2e-20260428/permission-audit-20260430104344
```

### Recent PR Diff Workflow Pitfalls

- Sparse `dit` testing is useful for small PR fixtures. Keep scratch clones under `/Users/lxs/Documents/AI/datahub-e2e-20260428`, not under `/Users/lxs`:

  ```sh
  dit clone --sparse --branch main --token "$DIT_TOKEN" \
    http://127.0.0.1:8000/sft-e2e-20260428 /tmp/or-clean-documents-path/repo
  dit sparse-checkout add stress/multi_turn/fast/chunk_000.jsonl
  ```

- For the current DataHub diff logic, changing only an existing row's assistant response content is classified as refreshed, not add/remove. `dit diff` should show a shape like `2 -> 2 rows (~1 refreshed)`, and the PR stats should be `stats_added: 0`, `stats_removed: 0`, `stats_refreshed: 1`.
- A `dit_*` token works for datahub-core on `8000`, but the gateway `POST /api/v1/repos/{owner}/{repo}/datahub/pulls` on `3003` expects a Forgejo API token. If you only have the DIT token, create the PR through core:

  ```sh
  curl -X POST http://127.0.0.1:8000/api/v1/repos/sft-e2e-20260428/pulls \
    -H "Authorization: token $DIT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"source_branch":"your-branch","target_branch":"main","title":"Smoke test","author":"codex"}'
  ```

- PR pages use `DataPullPage.vue`, but the Files changed tab mounts `DataDiffView.vue`. If a files-tab UI issue appears, inspect both the PR shell and the diff component before assuming the wrong file owns the bug.
- The `#files` URL hash may not activate the Files changed tab in non-interactive DOM dumps. In browser automation, explicitly click the `Files changed N` tab before checking row-level UI.
- Refreshed row payloads from `/datahub/diff/<base>/<head>` use `old_content` and `new_content`. If field-level hints are missing, confirm the frontend is reading those keys and not alternate names such as `old_row`, `new_row`, `before`, or `after`.
- For response-only refreshed rows, array-level summaries like `messages <list len=...>` are not enough for review. `DataDiffView` should surface message-level paths such as `messages[6].content` so reviewers can see which turn changed.
- `make webpack` can update `public/assets` without changing the `gitea` binary or the HTML asset version. If a current in-app browser tab still shows stale behavior, verify the served chunk directly and then use a fresh Chrome profile or a test build with a temporary `GITEA_VERSION` suffix:

  ```sh
  curl -sS http://127.0.0.1:3003/assets/js/datahub-repo-home-datahub-diff-view-datahub-commit-page-datahub-pull-page.74e93850.js \
    | rg 'Changed fields|flattenMessageFields|messages\['
  ```

- For cache-sensitive UI validation, a fresh system Chrome profile is often more reliable than the already-open in-app browser tab:

  ```sh
  tmp=$(mktemp -d /tmp/datahub-chrome-XXXXXX)
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
    --headless=new --disable-gpu --no-first-run --no-default-browser-check \
    --user-data-dir="$tmp" --virtual-time-budget=8000 --dump-dom \
    'http://127.0.0.1:3003/e2e/sft-e2e-20260428/data/pulls/5#files' \
    | rg 'Changed fields|messages\[[0-9]+\]\.content'
  rm -rf "$tmp"
  ```

## Focused Test Commands

Use focused component tests while iterating:

```sh
npx vitest run web_src/js/components/DataRepoHome.test.js
npx vitest run web_src/js/components/DataPreviewPage.test.js
npx vitest run web_src/js/components/DataDiffView.test.js
npx vitest run web_src/js/components/JsonlViewer.test.js
```

Common combined smoke set:

```sh
npx vitest run \
  web_src/js/components/DataRepoHome.test.js \
  web_src/js/components/DataPreviewPage.test.js \
  web_src/js/components/JsonlViewer.test.js
```

Use `make build` or the explicit `GITEA_VERSION=... TAGS=... make build` command before claiming the live `3003` UI has the change.

## Commit Hygiene

Before staging or committing:

```sh
git status --short --branch
git diff --stat
git diff --check
git ls-remote --heads origin main
```

Only stage your own files. If another agent changed files in the same area, re-read the relevant diff and integrate without reverting their work.
