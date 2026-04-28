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

test('shows latest commit and metadata coverage in the dataset overview', async () => {
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
  expect(wrapper.text()).toContain('Metadata coverage');
  expect(wrapper.text()).toContain('1/2 files');
  expect(wrapper.text()).toContain('missing metadata');
});

test('renders a Data explorer layout with go-to-file and dataset metadata panel', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/refs') return [{name: 'heads/main', target_hash: 'commit123'}];
    if (path === '/refs/heads/main') return {target_hash: 'commit123'};
    if (path === '/tree/commit123') {
      return {
        entries: [
          {name: 'train.jsonl', obj_type: 'manifest', obj_hash: 'manifest1', sidecar_hash: 'sidecar1'},
          {name: 'eval.jsonl', obj_type: 'manifest', obj_hash: 'manifest2', sidecar_hash: null},
        ],
      };
    }
    if (path === '/stats/commit123') {
      return {
        files: [
          {path: 'train.jsonl', row_count: 2, char_count: 128, token_estimate: 42, lang_distribution: {en: 2}, has_sidecar: true},
          {path: 'eval.jsonl', row_count: 1, char_count: 64, token_estimate: null, lang_distribution: null, has_sidecar: false},
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
    if (path === '/meta/commit123/train.jsonl/summary') return {row_count: 2, char_count: 128, token_estimate: 42, lang_distribution: {en: 2}};
    if (path === '/meta/commit123/eval.jsonl/summary') throw new Error('missing sidecar');
    if (path === '/checks/commit123') return {checks: []};
    if (path === '/log?ref=heads/main&limit=5') return {commits: []};
    if (path === '/pulls?status=open') return [];
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataRepoHome, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('Dataset metadata'));

  expect(wrapper.text()).toContain('Data explorer');
  expect(wrapper.find('input[placeholder="Go to file"]').exists()).toBe(true);
  expect(wrapper.text()).toContain('Branch');
  expect(wrapper.text()).toContain('Files');
  expect(wrapper.text()).toContain('Rows');
  expect(wrapper.text()).toContain('Chars');
  expect(wrapper.text()).toContain('Tokens');
  expect(wrapper.text()).toContain('Lang');
  expect(wrapper.text()).toContain('README-style dataset notes will appear here');
  expect(wrapper.text()).toContain('Privileged users will be able to edit dataset metadata in a later phase.');
  expect(wrapper.text()).toContain('Pull requests');
  expect(wrapper.text()).toContain('Recent commits');
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
  expect(wrapper.text()).toContain('Open data reviews');
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

  await wrapper.findAll('button').find((button) => button.text() === 'Preview diff').trigger('click');

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

test('uses explicit preview links for manifest files', async () => {
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
  expect(wrapper.text()).not.toContain('Back to file list');
});

test('keeps missing metadata compute actions with the file name', async () => {
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
  expect(actionCell.text()).toContain('Preview');
  expect(actionCell.text()).toContain('Blame');
  expect(actionCell.text()).toContain('Compute');
});
