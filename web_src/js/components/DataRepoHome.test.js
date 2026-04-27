import {mount} from '@vue/test-utils';
import {expect, test, vi} from 'vitest';

vi.mock('../utils/datahub-api.js', () => ({
  datahubFetch: vi.fn(),
}));

import DataRepoHome from './DataRepoHome.vue';
import {datahubFetch} from '../utils/datahub-api.js';

test('loads core tree entries using obj_type and obj_hash fields', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') {
      return {
        entries: [
          {
            name: 'train.jsonl',
            obj_type: 'manifest',
            obj_hash: 'manifest123',
            row_count: 2,
            size: 128,
          },
        ],
      };
    }
    if (path === '/stats/commit123') {
      return {
        files: [{path: 'train.jsonl', row_count: 2, char_count: 128, token_estimate: 0, lang_distribution: {}}],
        totals: {file_count: 1, row_count: 2, char_count: 128, token_estimate: 0, lang_distribution: {}},
      };
    }
    if (path === '/meta/commit123/train.jsonl/summary') throw new Error('missing sidecar');
    if (path === '/checks/commit123') return {checks: []};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('train.jsonl'));

  expect(wrapper.vm.tree.entries[0]).toMatchObject({
    type: 'manifest',
    hash: 'manifest123',
  });
  expect(wrapper.text()).toContain('1 files');
  expect(wrapper.text()).toContain('2 rows');
});

test('hydrates file list metrics from stats when tree omits row and size fields', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') {
      return {
        entries: [
          {
            name: 'train.jsonl',
            obj_type: 'manifest',
            obj_hash: 'manifest123',
            sidecar_hash: 'sidecar123',
          },
        ],
      };
    }
    if (path === '/stats/commit123') {
      return {
        files: [
          {
            path: 'train.jsonl',
            row_count: 2,
            char_count: 128,
            token_estimate: 42,
            lang_distribution: {en: 2},
            has_sidecar: true,
          },
        ],
        totals: {
          file_count: 1,
          row_count: 2,
          char_count: 128,
          token_estimate: 42,
          lang_distribution: {en: 2},
        },
      };
    }
    if (path === '/meta/commit123/train.jsonl/summary') return {row_count: 2, token_estimate: 42, lang_distribution: {en: 2}};
    if (path === '/checks/commit123') return {checks: []};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('train.jsonl'));

  expect(wrapper.text()).toContain('1 files');
  expect(wrapper.text()).toContain('2 rows');
  expect(wrapper.text()).toContain('128 chars');
  expect(wrapper.text()).toContain('42');
  expect(wrapper.text()).toContain('en 100%');
});

test('hydrates row counts from manifest totals when sidecar metrics are missing', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') {
      return {
        entries: [
          {
            name: 'ml2.jsonl',
            obj_type: 'manifest',
            obj_hash: 'manifest123',
            sidecar_hash: null,
          },
        ],
      };
    }
    if (path === '/stats/commit123') {
      return {
        files: [
          {
            path: 'ml2.jsonl',
            row_count: null,
            char_count: null,
            token_estimate: null,
            lang_distribution: null,
            has_sidecar: false,
          },
        ],
        totals: {
          file_count: 1,
          row_count: 0,
          char_count: 0,
          token_estimate: 0,
          lang_distribution: {},
        },
      };
    }
    if (path === '/meta/commit123/ml2.jsonl/summary') throw new Error('missing sidecar');
    if (path === '/manifest/commit123/ml2.jsonl?offset=0&limit=1') {
      return {total: 1, entries: [{row_hash: 'row1'}]};
    }
    if (path === '/checks/commit123') return {checks: []};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('ml2.jsonl'));

  expect(wrapper.vm.tree.entries[0].row_count).toBe(1);
  expect(wrapper.text()).toContain('1 rows');
});

test('shows an empty state when a new data repo has no refs yet', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [];
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'empty-dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('No branches have been published yet'));

  expect(wrapper.text()).toContain('Push JSONL data with dit to create the first dataset branch');
});

test('renders blame response using entries and summary fields', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') {
      return {
        entries: [
          {
            name: 'train.jsonl',
            obj_type: 'manifest',
            obj_hash: 'manifest123',
          },
        ],
      };
    }
    if (path === '/stats/commit123') {
      return {
        files: [],
        totals: {file_count: 0, row_count: 0, char_count: 0, token_estimate: 0, lang_distribution: {}},
      };
    }
    if (path === '/meta/commit123/train.jsonl/summary') throw new Error('missing sidecar');
    if (path === '/checks/commit123') return {checks: []};
    if (path === '/blame/commit123/train.jsonl') {
      return {
        entries: [
          {
            row_index: 0,
            commit_hash: 'abcdef1234567890',
            author: 'alice',
            timestamp: 1713600000,
            content_preview: '{"instruction":"Explain LRU cache"}',
          },
        ],
        summary: {
          total_rows: 1,
          unique_commits: 1,
          unique_authors: 1,
        },
      };
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('train.jsonl'));

  await wrapper.findAll('button').find((button) => button.text() === 'Blame').trigger('click');
  await vi.waitFor(() => expect(wrapper.text()).toContain('Blame: train.jsonl'));

  expect(wrapper.text()).toContain('1 rows');
  expect(wrapper.text()).toContain('1 commits');
  expect(wrapper.text()).toContain('1 authors');
  expect(wrapper.text()).toContain('abcdef1');
  expect(wrapper.text()).toContain('alice');
  expect(wrapper.text()).toContain('Explain LRU cache');
});
