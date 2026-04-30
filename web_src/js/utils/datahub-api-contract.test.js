/**
 * API contract tests that hit the live gateway (port 3003) proxying to
 * datahub-core (port 8000).  They validate response shapes so that
 * frontend mocks stay in sync with the real backend.
 *
 * Skipped automatically when the gateway is not reachable.
 *
 * @vitest-environment node
 */
import {describe, test, expect, beforeAll} from 'vitest';

const GATEWAY = 'http://127.0.0.1:3003';
const OWNER = 'e2e';
const REPO = 'sft-e2e-20260428';
const TOKEN = process.env.DATAHUB_GATEWAY_TOKEN || '';

function api(path) {
  return `${GATEWAY}/api/v1/repos/${OWNER}/${REPO}/datahub${path}`;
}

function headers() {
  const h = {'Content-Type': 'application/json'};
  if (TOKEN) h.Authorization = `token ${TOKEN}`;
  return h;
}

async function fetchJSON(path) {
  const resp = await fetch(api(path), {headers: headers()});
  expect(resp.ok).toBe(true);
  return resp.json();
}

let alive = false;

beforeAll(async () => {
  try {
    const resp = await fetch(`${GATEWAY}/api/healthz`, {signal: AbortSignal.timeout(2000)});
    alive = resp.ok;
  } catch {
    alive = false;
  }
});

function liveTest(name, fn) {
  test(name, async () => {
    if (!alive) return test.skip;
    await fn();
  });
}

// ── refs ──────────────────────────────────────────────────────────────

describe('refs contract', () => {
  liveTest('GET /refs returns array of {name, target_hash}', async () => {
    const data = await fetchJSON('/refs');
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    for (const ref of data) {
      expect(ref).toHaveProperty('name');
      expect(ref).toHaveProperty('target_hash');
      expect(typeof ref.name).toBe('string');
      expect(typeof ref.target_hash).toBe('string');
      expect(ref.target_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  liveTest('GET /refs/heads/main returns single ref object', async () => {
    const data = await fetchJSON('/refs/heads/main');
    expect(data).toHaveProperty('name', 'heads/main');
    expect(data).toHaveProperty('target_hash');
    expect(data.target_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── tree ──────────────────────────────────────────────────────────────

describe('tree contract', () => {
  let commitHash;

  beforeAll(async () => {
    if (!alive) return;
    const ref = await fetchJSON('/refs/heads/main');
    commitHash = ref.target_hash;
  });

  liveTest('GET /tree/:commit/ returns {commit_hash, path, entries}', async () => {
    const data = await fetchJSON(`/tree/${commitHash}/`);
    expect(data).toHaveProperty('commit_hash', commitHash);
    expect(data).toHaveProperty('path');
    expect(Array.isArray(data.entries)).toBe(true);
    for (const entry of data.entries) {
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('obj_type');
      expect(entry).toHaveProperty('obj_hash');
      expect(['blob', 'tree']).toContain(entry.obj_type);
      expect(entry).toHaveProperty('sidecar_hash');
    }
  });
});

// ── stats ─────────────────────────────────────────────────────────────

describe('stats contract', () => {
  liveTest('GET /stats/heads/main returns {commit_hash, files}', async () => {
    const data = await fetchJSON('/stats/heads/main?include_size=false');
    expect(data).toHaveProperty('commit_hash');
    expect(data.commit_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Array.isArray(data.files)).toBe(true);
    if (data.files.length > 0) {
      const file = data.files[0];
      expect(file).toHaveProperty('path');
      expect(file).toHaveProperty('row_count');
      expect(typeof file.path).toBe('string');
      expect(typeof file.row_count).toBe('number');
      expect(file).toHaveProperty('has_sidecar');
    }
  });
});

// ── diff ──────────────────────────────────────────────────────────────

describe('diff contract', () => {
  const OLD_COMMIT = '7f614cad7d0b5721ce3911c6bc1c893aa95580f08e78edb5d131ba9689bc326c';
  const NEW_COMMIT = '6f89300a32bb34ee3b960451960c4118b8ade0d7d024d5ebc2ada806c4dc38d8';

  liveTest('GET /diff/:old/:new returns {old_commit, new_commit, summary, files}', async () => {
    const data = await fetchJSON(`/diff/${OLD_COMMIT}/${NEW_COMMIT}`);
    expect(data).toHaveProperty('old_commit', OLD_COMMIT);
    expect(data).toHaveProperty('new_commit', NEW_COMMIT);

    const summary = data.summary;
    expect(summary).toHaveProperty('files_changed');
    expect(summary).toHaveProperty('rows_added');
    expect(summary).toHaveProperty('rows_removed');
    expect(summary).toHaveProperty('rows_refreshed');
    expect(typeof summary.files_changed).toBe('number');

    expect(Array.isArray(data.files)).toBe(true);
    if (data.files.length > 0) {
      const file = data.files[0];
      expect(file).toHaveProperty('path');
      expect(file).toHaveProperty('added');
      expect(file).toHaveProperty('removed');
      expect(file).toHaveProperty('refreshed');
      expect(file).toHaveProperty('old_total');
      expect(file).toHaveProperty('new_total');
    }
  });

  liveTest('diff includes added_rows with {row_hash, position, content}', async () => {
    const data = await fetchJSON(`/diff/${OLD_COMMIT}/${NEW_COMMIT}`);
    const file = data.files.find((f) => f.added > 0);
    expect(file).toBeDefined();
    expect(Array.isArray(file.added_rows)).toBe(true);
    const row = file.added_rows[0];
    expect(row).toHaveProperty('row_hash');
    expect(row).toHaveProperty('position');
    expect(row).toHaveProperty('content');
    expect(typeof row.content).toBe('object');
  });
});

// ── pulls ─────────────────────────────────────────────────────────────

describe('pulls contract', () => {
  liveTest('GET /pulls returns array of pull request objects', async () => {
    const data = await fetchJSON('/pulls');
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const pr = data[0];
    expect(pr).toHaveProperty('id');
    expect(pr).toHaveProperty('pull_request_id');
    expect(pr).toHaveProperty('title');
    expect(pr).toHaveProperty('author');
    expect(pr).toHaveProperty('status');
    expect(['open', 'closed', 'merged']).toContain(pr.status);
    expect(pr).toHaveProperty('source_ref');
    expect(pr).toHaveProperty('target_ref');
    expect(pr).toHaveProperty('source_commit');
    expect(pr).toHaveProperty('target_commit');
    expect(pr).toHaveProperty('is_mergeable');
    expect(pr).toHaveProperty('stats_added');
    expect(pr).toHaveProperty('stats_removed');
    expect(pr).toHaveProperty('stats_refreshed');
    expect(pr).toHaveProperty('created_at');
    expect(pr).toHaveProperty('updated_at');
  });

  liveTest('GET /pulls?status=open filters by status', async () => {
    const data = await fetchJSON('/pulls?status=open');
    expect(Array.isArray(data)).toBe(true);
    for (const pr of data) {
      expect(pr.status).toBe('open');
    }
  });

  liveTest('GET /pulls/:id returns single pull request', async () => {
    const data = await fetchJSON('/pulls/1');
    expect(data).toHaveProperty('id', 1);
    expect(data).toHaveProperty('title');
    expect(data).toHaveProperty('source_ref');
    expect(data).toHaveProperty('target_ref');
    expect(data).toHaveProperty('base_commit');
  });
});

// ── governance ────────────────────────────────────────────────────────

describe('governance contract', () => {
  liveTest('GET /governance returns repo, reviewers, protections, current_user, links', async () => {
    const resp = await fetch(api('/governance'), {headers: headers()});
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data).toHaveProperty('repository');
    expect(data).toHaveProperty('reviewers');
    expect(data).toHaveProperty('branch_protections');
    expect(data).toHaveProperty('current_user');
    expect(data.current_user).toHaveProperty('is_authenticated');
    expect(data.current_user).toHaveProperty('can_merge');
    expect(data).toHaveProperty('links');
    expect(data.links).toHaveProperty('settings');
    expect(data.links).toHaveProperty('collaboration');
    expect(data.links).toHaveProperty('branches');
  });
});
