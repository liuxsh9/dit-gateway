import {mount} from '@vue/test-utils';
import {expect, test, vi} from 'vitest';

vi.mock('../utils/datahub-api.js', () => ({
  datahubFetch: vi.fn(),
}));

import DataRepoHome from './DataRepoHome.vue';
import {datahubFetch} from '../utils/datahub-api.js';

const diffStub = {
  name: 'DataDiffView',
  props: ['owner', 'repo', 'oldCommit', 'newCommit'],
  template: '<div class="data-diff-stub">Diff {{ oldCommit }}..{{ newCommit }}</div>',
};

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
  expect(wrapper.text()).not.toContain('1 files');
  expect(wrapper.text()).toContain('train.jsonl');
  expect(wrapper.vm.directoryEntries[0].row_count).toBe(2);
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
            size_bytes: 256,
            token_estimate: 42,
            lang_distribution: {en: 2},
            has_sidecar: true,
          },
        ],
        totals: {
          file_count: 1,
          row_count: 2,
          char_count: 128,
          size_bytes: 256,
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

  expect(wrapper.text()).not.toContain('1 files');
  expect(wrapper.text()).toContain('train.jsonl');
  expect(wrapper.vm.directoryEntries[0]).toMatchObject({
    row_count: 2,
    char_count: 128,
    size_bytes: 256,
    token_estimate: 42,
  });
  expect(wrapper.text()).toContain('256 B');
  expect(wrapper.text()).not.toContain('42');
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
  expect(wrapper.text()).toContain('ml2.jsonl');
  expect(wrapper.vm.directoryEntries[0].row_count).toBe(1);
});

test('shows latest commit and missing metadata inline with affected files', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') {
      return {
        entries: [
          {name: 'train.jsonl', obj_type: 'manifest', obj_hash: 'manifest1', sidecar_hash: 'sidecar1'},
          {name: 'ml2.jsonl', obj_type: 'manifest', obj_hash: 'manifest2', sidecar_hash: null},
        ],
      };
    }
    if (path === '/stats/commit123') {
      return {
        files: [
          {path: 'train.jsonl', row_count: 2, char_count: 128, token_estimate: 42, lang_distribution: {en: 2}, has_sidecar: true},
          {path: 'ml2.jsonl', row_count: null, char_count: null, token_estimate: null, lang_distribution: null, has_sidecar: false},
        ],
        totals: {
          file_count: 2,
          files_with_sidecar: 1,
          row_count: 2,
          char_count: 128,
          token_estimate: 42,
          lang_distribution: {en: 2},
        },
      };
    }
    if (path === '/meta/commit123/train.jsonl/summary') return {row_count: 2, char_count: 128, token_estimate: 42, lang_distribution: {en: 2}};
    if (path === '/meta/commit123/ml2.jsonl/summary') throw new Error('missing sidecar');
    if (path === '/manifest/commit123/ml2.jsonl?offset=0&limit=1') return {total: 1, entries: [{row_hash: 'row1'}]};
    if (path === '/checks/commit123') return {checks: [{check_name: 'format', status: 'pass'}]};
    if (path === '/log?ref=heads/main&limit=5') {
      return {
        commits: [
          {
            commit_hash: 'abcdef1234567890',
            author: 'alice',
            message: 'add ML2 smoke data',
            timestamp: 1713600000,
          },
        ],
      };
    }
    if (path === '/pulls?status=open') return [];
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('add ML2 smoke data'));

  expect(wrapper.text()).toContain('abcdef1');
  expect(wrapper.text()).toContain('alice');
  expect(wrapper.text()).toContain('metadata missing');
  expect(wrapper.text()).not.toContain('Metadata coverage');
});

test('renders a GitHub-like Data file browser without duplicate side rails', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') {
      return {
        entries: [
          {name: 'train/general.jsonl', obj_type: 'manifest', obj_hash: 'manifest1', sidecar_hash: 'sidecar1'},
          {name: 'eval/hard.jsonl', obj_type: 'manifest', obj_hash: 'manifest2', sidecar_hash: null},
        ],
      };
    }
    if (path === '/stats/commit123') {
      return {
        files: [
          {path: 'train/general.jsonl', row_count: 2, char_count: 128, token_estimate: 42, lang_distribution: {en: 2}, has_sidecar: true},
          {path: 'eval/hard.jsonl', row_count: 1, char_count: 64, token_estimate: null, lang_distribution: null, has_sidecar: false},
        ],
        totals: {
          file_count: 2,
          files_with_sidecar: 1,
          row_count: 3,
          char_count: 192,
          token_estimate: 42,
          lang_distribution: {en: 2},
        },
      };
    }
    if (path === '/meta/commit123/train/general.jsonl/summary') return {row_count: 2, char_count: 128, token_estimate: 42, lang_distribution: {en: 2}};
    if (path === '/meta/commit123/eval/hard.jsonl/summary') throw new Error('missing sidecar');
    if (path === '/checks/commit123') return {checks: []};
    if (path === '/log?ref=heads/main&limit=5') return {commits: []};
    if (path === '/pulls?status=open') return [];
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('1 Branch'));

  expect(wrapper.find('.datahub-repo-controls input[placeholder="Go to file"]').exists()).toBe(true);
  expect(wrapper.findAll('select[aria-label="Branch"]')).toHaveLength(1);
  expect(wrapper.text()).toContain('train');
  expect(wrapper.text()).toContain('eval');
  expect(wrapper.text()).toContain('Rows');
  expect(wrapper.text()).toContain('Last commit');
  expect(wrapper.text()).toContain('Updated');
  expect(wrapper.text()).toContain('Size');
  expect(wrapper.text()).not.toContain('Chars');
  expect(wrapper.text()).not.toContain('Tokens');
  expect(wrapper.text()).toContain('Lang');
  expect(wrapper.text()).toContain('Pull requests');
  expect(wrapper.text()).toContain('Recent commits');
  expect(wrapper.text()).not.toContain('Selected file links');
  expect(wrapper.text()).not.toContain('Dataset Stats');
  expect(wrapper.text()).not.toContain('Preview');
  expect(wrapper.text()).not.toContain('Blame');

  await wrapper.findAll('.datahub-file-link').find((link) => link.text() === 'train').trigger('click');
  expect(wrapper.find('a[href="/alice/dataset/data/preview/commit123/train/general.jsonl"]').exists()).toBe(true);
});

test('uses distinct tree affordances for folders and files in the Data browser', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') {
      return {
        entries: [
          {name: 'eval/tool/weather.jsonl', obj_type: 'manifest', obj_hash: 'manifest1', sidecar_hash: 'sidecar1'},
          {name: 'train.jsonl', obj_type: 'manifest', obj_hash: 'manifest2', sidecar_hash: 'sidecar2'},
        ],
      };
    }
    if (path === '/stats/commit123') {
      return {
        files: [
          {path: 'eval/tool/weather.jsonl', row_count: 1, char_count: 64, token_estimate: 16, lang_distribution: {en: 1}, has_sidecar: true},
          {path: 'train.jsonl', row_count: 2, char_count: 128, token_estimate: 32, lang_distribution: {en: 2}, has_sidecar: true},
        ],
        totals: {file_count: 2, row_count: 3, char_count: 192, token_estimate: 48, lang_distribution: {en: 3}},
      };
    }
    if (path === '/meta/commit123/eval/tool/weather.jsonl/summary') return {row_count: 1, char_count: 64, token_estimate: 16, lang_distribution: {en: 1}};
    if (path === '/meta/commit123/train.jsonl/summary') return {row_count: 2, char_count: 128, token_estimate: 32, lang_distribution: {en: 2}};
    if (path === '/checks/commit123') return {checks: []};
    if (path === '/log?ref=heads/main&limit=5') return {commits: []};
    if (path === '/pulls?status=open') return [];
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('eval'));

  const folderRows = wrapper.findAll('.datahub-file-row-folder');
  const fileRows = wrapper.findAll('.datahub-file-row-file');
  expect(folderRows).toHaveLength(1);
  expect(fileRows).toHaveLength(1);
  expect(folderRows[0].find('.datahub-tree-chevron').exists()).toBe(true);
  expect(folderRows[0].find('.datahub-tree-folder-icon').exists()).toBe(true);
  expect(folderRows[0].text()).toContain('—');
  expect(folderRows[0].text()).not.toContain('0 B');
  expect(fileRows[0].find('.datahub-tree-file-spacer').exists()).toBe(true);
  expect(fileRows[0].find('.datahub-tree-file-icon').exists()).toBe(true);
});

test('uses a GitHub-like compact Data toolbar and commit strip', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [
      {name: 'heads/main', target_hash: 'commit123'},
      {name: 'heads/eval-refresh', target_hash: 'commit456'},
    ];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') {
      return {
        entries: [
          {name: 'eval/tool/weather.jsonl', obj_type: 'manifest', obj_hash: 'manifest1', sidecar_hash: 'sidecar1'},
          {name: 'train.jsonl', obj_type: 'manifest', obj_hash: 'manifest2', sidecar_hash: 'sidecar2'},
        ],
      };
    }
    if (path === '/stats/commit123') {
      return {
        files: [
          {path: 'eval/tool/weather.jsonl', row_count: 1, char_count: 64, token_estimate: 16, lang_distribution: {en: 1}, has_sidecar: true},
          {path: 'train.jsonl', row_count: 2, char_count: 128, token_estimate: 32, lang_distribution: {en: 2}, has_sidecar: true},
        ],
        totals: {file_count: 2, row_count: 3, char_count: 192, token_estimate: 48, lang_distribution: {en: 3}},
      };
    }
    if (path === '/meta/commit123/eval/tool/weather.jsonl/summary') return {row_count: 1, char_count: 64, token_estimate: 16, lang_distribution: {en: 1}};
    if (path === '/meta/commit123/train.jsonl/summary') return {row_count: 2, char_count: 128, token_estimate: 32, lang_distribution: {en: 2}};
    if (path === '/checks/commit123') return {checks: [{check_name: 'format', status: 'pass'}]};
    if (path === '/log?ref=heads/main&limit=5') {
      return {
        commits: [
          {
            commit_hash: 'commit123',
            author: 'alice',
            message: 'refresh data rows',
            timestamp: 1713600000,
          },
          {
            commit_hash: 'fedcba9876543210',
            author: 'bob',
            message: 'clean rejected samples',
            timestamp: 1713513600,
          },
        ],
      };
    }
    if (path === '/tree/fedcba9876543210') {
      return {
        entries: [
          {name: 'eval/tool/weather.jsonl', obj_type: 'manifest', obj_hash: 'old-manifest1', sidecar_hash: 'old-sidecar1'},
          {name: 'train.jsonl', obj_type: 'manifest', obj_hash: 'manifest2', sidecar_hash: 'sidecar2'},
        ],
      };
    }
    if (path === '/pulls?status=open') return [];
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('refresh data rows'));

  expect(wrapper.find('.datahub-toolbar').exists()).toBe(false);
  expect(wrapper.text()).not.toContain('Dit dataset');
  expect(wrapper.text()).not.toContain('SFT data repository');
  expect(wrapper.text()).not.toContain('Click a JSONL file');
  expect(wrapper.find('.datahub-repo-controls select[aria-label="Branch"]').exists()).toBe(true);
  expect(wrapper.find('.datahub-branch-button-icon').exists()).toBe(true);
  expect(wrapper.find('.datahub-branch-button-chevron').exists()).toBe(true);
  expect(wrapper.find('.datahub-repo-controls').text()).toContain('2 Branches');
  expect(wrapper.find('.datahub-repo-controls').text()).toContain('0 Tags');
  expect(wrapper.find('.datahub-repo-controls input[placeholder="Go to file"]').exists()).toBe(true);
  expect(wrapper.find('.datahub-repo-actions').exists()).toBe(true);
  expect(wrapper.find('.datahub-file-browser-tools').text()).toContain('alice');
  expect(wrapper.find('.datahub-file-browser-tools').text()).toContain('refresh data rows');
  expect(wrapper.find('.datahub-file-browser-tools').text()).toContain('CI pass');
  expect(wrapper.find('.datahub-file-browser-tools').text()).toContain('commit1');
  expect(wrapper.find('.datahub-file-browser-tools').text()).toContain('2 Commits');
  expect(wrapper.find('.datahub-commit-count').classes()).not.toContain('button');
  expect(wrapper.find('.datahub-pr-workflow').classes()).toContain('datahub-card-panel');
  expect(wrapper.find('.datahub-file-row-folder').text()).not.toContain('eval/');
  expect(wrapper.find('.datahub-file-row-folder').text()).toContain('refresh data rows');
  expect(wrapper.find('.datahub-file-row-file').text()).toContain('clean rejected samples');
});

test('renders mobile-readable file row metrics without relying on table columns', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') {
      return {
        entries: [
          {name: 'eval/tool/weather.jsonl', obj_type: 'manifest', obj_hash: 'manifest1', sidecar_hash: 'sidecar1'},
        ],
      };
    }
    if (path === '/stats/commit123') {
      return {
        files: [
          {path: 'eval/tool/weather.jsonl', row_count: 1, char_count: 641, size_bytes: 702, token_estimate: 160, lang_distribution: {en: 1}, has_sidecar: true},
        ],
        totals: {file_count: 1, row_count: 1, char_count: 641, token_estimate: 160, lang_distribution: {en: 1}},
      };
    }
    if (path === '/meta/commit123/eval/tool/weather.jsonl/summary') return {row_count: 1, char_count: 641, token_estimate: 160, lang_distribution: {en: 1}};
    if (path === '/checks/commit123') return {checks: []};
    if (path === '/log?ref=heads/main&limit=5') return {commits: []};
    if (path === '/pulls?status=open') return [];
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('eval'));

  await wrapper.findAll('.datahub-file-link').find((link) => link.text() === 'eval').trigger('click');
  await wrapper.findAll('.datahub-file-link').find((link) => link.text() === 'tool').trigger('click');

  const mobileMetrics = wrapper.find('.datahub-file-mobile-metrics');
  expect(mobileMetrics.exists()).toBe(true);
  expect(mobileMetrics.text()).toContain('Rows 1');
  expect(mobileMetrics.text()).toContain('Size 702 B');
  expect(mobileMetrics.text()).not.toContain('Chars');
  expect(mobileMetrics.text()).not.toContain('Tokens');
  expect(mobileMetrics.text()).toContain('Lang en 100%');
});

test('uses stats file paths to expose nested JSONL files when the root tree only has folders', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') {
      return {
        entries: [
          {name: 'eval', obj_type: 'tree', obj_hash: 'tree1'},
          {name: 'train', obj_type: 'tree', obj_hash: 'tree2'},
          {name: 'train.jsonl', obj_type: 'manifest', obj_hash: 'manifest-root'},
        ],
      };
    }
    if (path === '/stats/commit123') {
      return {
        files: [
          {path: 'eval/tool/weather.jsonl', row_count: 1, char_count: 641, size_bytes: 702, token_estimate: 160, lang_distribution: {en: 1}, has_sidecar: true},
          {path: 'train/general.jsonl', row_count: 2, char_count: 696, size_bytes: 760, token_estimate: 174, lang_distribution: {zh: 1, en: 1}, has_sidecar: true},
          {path: 'train.jsonl', row_count: 3, char_count: 308, size_bytes: 340, token_estimate: 76, lang_distribution: {en: 3}, has_sidecar: true},
        ],
        totals: {file_count: 3, files_with_sidecar: 3, row_count: 6, char_count: 1645, size_bytes: 1802, token_estimate: 410, lang_distribution: {en: 5, zh: 1}},
      };
    }
    if (path === '/meta/commit123/eval/tool/weather.jsonl/summary') return {row_count: 1, char_count: 641, token_estimate: 160, lang_distribution: {en: 1}};
    if (path === '/meta/commit123/train/general.jsonl/summary') return {row_count: 2, char_count: 696, token_estimate: 174, lang_distribution: {zh: 1, en: 1}};
    if (path === '/meta/commit123/train.jsonl/summary') return {row_count: 3, char_count: 308, token_estimate: 76, lang_distribution: {en: 3}};
    if (path === '/checks/commit123') return {checks: []};
    if (path === '/log?ref=heads/main&limit=5') return {commits: []};
    if (path === '/pulls?status=open') return [];
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('eval'));

  await wrapper.findAll('.datahub-file-link').find((link) => link.text() === 'eval').trigger('click');
  expect(wrapper.text()).toContain('tool');
  expect(wrapper.text()).not.toContain('weather.jsonl');

  await wrapper.findAll('.datahub-file-link').find((link) => link.text() === 'tool').trigger('click');
  expect(wrapper.text()).toContain('weather.jsonl');
  expect(wrapper.text()).toContain('702 B');
  expect(wrapper.find('a[href="/alice/dataset/data/preview/commit123/eval/tool/weather.jsonl"]').exists()).toBe(true);
});

test('shows dit workflow commands for dataset collaboration', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') return {entries: []};
    if (path === '/stats/commit123') {
      return {
        files: [],
        totals: {file_count: 0, row_count: 0, char_count: 0, token_estimate: 0, lang_distribution: {}},
      };
    }
    if (path === '/checks/commit123') return {checks: []};
    if (path === '/log?ref=heads/main&limit=5') return {commits: []};
    if (path === '/pulls?status=open') return [];
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'sft-data', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('Use this dataset'));

  expect(wrapper.text()).toContain('dit clone http://localhost:3000/alice/sft-data');
  expect(wrapper.text()).toContain('dit checkout -b update/sft-batch');
  expect(wrapper.text()).toContain('dit push --remote origin --branch update/sft-batch');
  expect(wrapper.text()).toContain('curl -X POST http://localhost:3000/api/v1/repos/alice/sft-data/datahub/pulls');
  expect(wrapper.text()).toContain('Authorization: token <token>');
  expect(wrapper.text()).toContain('"source_branch":"update/sft-batch"');
  expect(wrapper.text()).toContain('Push a branch and open a review');
});

test('shows recent commits and open pull requests on the repo home', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') return {entries: []};
    if (path === '/stats/commit123') {
      return {
        files: [],
        totals: {file_count: 0, row_count: 0, char_count: 0, token_estimate: 0, lang_distribution: {}},
      };
    }
    if (path === '/checks/commit123') return {checks: []};
    if (path === '/log?ref=heads/main&limit=5') {
      return {
        commits: [
          {
            commit_hash: 'abcdef1234567890',
            author: 'alice',
            message: 'latest dataset update',
            timestamp: 1713600000,
          },
          {
            commit_hash: 'fedcba9876543210',
            author: 'bob',
            message: 'clean rejected samples',
            timestamp: 1713513600,
          },
        ],
      };
    }
    if (path === '/pulls?status=open') {
      return [
        {
          pull_request_id: 7,
          title: 'Refresh safety SFT split',
          author: 'carol',
          status: 'open',
          source_ref: 'heads/safety-refresh',
          target_ref: 'heads/main',
          source_commit: 'sourcecommit123456',
          target_commit: 'targetcommit123456',
          is_mergeable: true,
          stats_added: 12,
          stats_removed: 3,
          stats_refreshed: 4,
          updated_at: 1713600500,
        },
      ];
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
    global: {stubs: {DataDiffView: diffStub}},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('Repository activity'));

  expect(wrapper.text()).toContain('Recent commits');
  expect(wrapper.text()).toContain('clean rejected samples');
  expect(wrapper.text()).toContain('Review SFT dataset changes before merge');
  expect(wrapper.text()).toContain('Refresh safety SFT split');
  expect(wrapper.text()).toContain('+12');
  expect(wrapper.text()).toContain('-3');
  expect(wrapper.text()).toContain('~4');
});

test('opens an inline data diff preview from the pull request queue', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') return {entries: []};
    if (path === '/stats/commit123') {
      return {
        files: [],
        totals: {file_count: 0, row_count: 0, char_count: 0, token_estimate: 0, lang_distribution: {}},
      };
    }
    if (path === '/checks/commit123') return {checks: []};
    if (path === '/log?ref=heads/main&limit=5') return {commits: []};
    if (path === '/pulls?status=open') {
      return [
        {
          pull_request_id: 7,
          title: 'Refresh safety SFT split',
          author: 'carol',
          status: 'open',
          source_ref: 'heads/safety-refresh',
          target_ref: 'heads/main',
          source_commit: 'sourcecommit123456',
          target_commit: 'targetcommit123456',
          is_mergeable: false,
          conflict_files: ['train.jsonl'],
          stats_added: 12,
          stats_removed: 3,
          stats_refreshed: 4,
        },
      ];
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
    global: {stubs: {DataDiffView: diffStub}},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('Refresh safety SFT split'));

  await wrapper.findAll('button').find((button) => button.text() === 'Open review').trigger('click');

  expect(wrapper.text()).toContain('Review data changes');
  expect(wrapper.text()).toContain('Refresh safety SFT split');
  expect(wrapper.text()).toContain('Diff targetcommit123456..sourcecommit123456');
  expect(wrapper.text()).toContain('Conflicts: train.jsonl');
});

test('links recent commits to the dedicated commit page', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') return {entries: []};
    if (path === '/stats/commit123') {
      return {
        files: [],
        totals: {file_count: 0, row_count: 0, char_count: 0, token_estimate: 0, lang_distribution: {}},
      };
    }
    if (path === '/checks/commit123') return {checks: []};
    if (path === '/log?ref=heads/main&limit=5') {
      return {
        commits: [
          {
            commit_hash: 'newcommit123456',
            parent_hashes: ['oldcommit123456'],
            author: 'alice',
            message: 'refresh chat data',
            timestamp: 1713600000,
          },
        ],
      };
    }
    if (path === '/pulls?status=open') return [];
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
    global: {stubs: {DataDiffView: diffStub}},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('refresh chat data'));

  expect(wrapper.text()).toContain('refresh chat data');
  expect(wrapper.find('a[href="/alice/dataset/data/commit/newcommit123456"]').exists()).toBe(true);
  expect(wrapper.find('.data-diff-stub').exists()).toBe(false);
});

test('surfaces metadata compute failures for a file', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path, options) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') {
      return {entries: [{name: 'ml2.jsonl', obj_type: 'manifest', obj_hash: 'manifest123', sidecar_hash: null}]};
    }
    if (path === '/stats/commit123') {
      return {
        files: [{path: 'ml2.jsonl', row_count: null, char_count: null, token_estimate: null, lang_distribution: null, has_sidecar: false}],
        totals: {file_count: 1, files_with_sidecar: 0, row_count: 0, char_count: 0, token_estimate: 0, lang_distribution: {}},
      };
    }
    if (path === '/meta/commit123/ml2.jsonl/summary') throw new Error('missing sidecar');
    if (path === '/manifest/commit123/ml2.jsonl?offset=0&limit=1') return {total: 1, entries: [{row_hash: 'row1'}]};
    if (path === '/checks/commit123') return {checks: []};
    if (path === '/log?ref=heads/main&limit=5') return {commits: []};
    if (path === '/pulls?status=open') return [];
    if (path === '/meta/compute' && options?.method === 'POST') throw new Error('compute failed');
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('ml2.jsonl'));

  await wrapper.findAll('button').find((button) => button.text() === 'Compute').trigger('click');
  await vi.waitFor(() => expect(wrapper.text()).toContain('compute failed'));
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

test('uses file names as direct preview links for manifest files', async () => {
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
        files: [{path: 'train.jsonl', row_count: 2, char_count: 128, token_estimate: 42, lang_distribution: {en: 2}, has_sidecar: true}],
        totals: {file_count: 1, files_with_sidecar: 1, row_count: 2, char_count: 128, token_estimate: 42, lang_distribution: {en: 2}},
      };
    }
    if (path === '/meta/commit123/train.jsonl/summary') return {row_count: 2, char_count: 128, token_estimate: 42, lang_distribution: {en: 2}};
    if (path === '/checks/commit123') return {checks: []};
    if (path === '/log?ref=heads/main&limit=5') return {commits: []};
    if (path === '/pulls?status=open') return [];
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('train.jsonl'));

  expect(wrapper.find('a[href="/alice/dataset/data/preview/commit123/train.jsonl"]').exists()).toBe(true);
  expect(wrapper.text()).not.toContain('Preview');
  expect(wrapper.text()).not.toContain('Blame');
});

test('keeps missing metadata compute actions next to the file name', async () => {
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
        files: [{path: 'ml2.jsonl', row_count: null, char_count: null, token_estimate: null, lang_distribution: null, has_sidecar: false}],
        totals: {file_count: 1, files_with_sidecar: 0, row_count: 0, char_count: 0, token_estimate: 0, lang_distribution: {}},
      };
    }
    if (path === '/meta/commit123/ml2.jsonl/summary') throw new Error('missing sidecar');
    if (path === '/manifest/commit123/ml2.jsonl?offset=0&limit=1') return {total: 1, entries: [{row_hash: 'row1'}]};
    if (path === '/checks/commit123') return {checks: []};
    if (path === '/log?ref=heads/main&limit=5') return {commits: []};
    if (path === '/pulls?status=open') return [];
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('ml2.jsonl'));

  expect(wrapper.findAll('th').map((header) => header.text())).not.toContain('Actions');
  const actionCell = wrapper.find('.datahub-file-table tbody tr td:first-child');
  expect(actionCell.text()).toContain('Compute');
  expect(actionCell.text()).not.toContain('Preview');
  expect(actionCell.text()).not.toContain('Blame');
});
