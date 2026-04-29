import {mount} from '@vue/test-utils';
import {expect, test, vi} from 'vitest';
import DataPullPage from './DataPullPage.vue';
import {datahubFetch} from '../utils/datahub-api.js';

vi.mock('../utils/datahub-api.js', () => ({
  datahubFetch: vi.fn(),
}));

const diffStub = {
  name: 'DataDiffView',
  props: ['owner', 'repo', 'oldCommit', 'newCommit', 'reviewMode', 'pullId', 'currentUser', 'canComment'],
  emits: ['comment-created'],
  template: `
    <div class="data-diff-stub">
      Diff {{ oldCommit }}..{{ newCommit }} {{ reviewMode ? "review" : "" }} {{ canComment ? "can-comment" : "read-only" }}
      <button
        type="button"
        class="emit-row-comment"
        @click="$emit('comment-created', {
          id: 99,
          author: currentUser,
          body: 'Inline row concern',
          file_path: 'train.jsonl',
          row_hash: 'rowabc123456',
          change_type: 'added',
          field_path: 'row:3',
        })"
      >Emit row comment</button>
    </div>
  `,
};

test('loads a github-like pull request conversation with timeline, checks, commits, and merge box', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path, options = {}) => {
    if (path === '/pulls/7') {
      return {
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
        comments_count: 2,
      };
    }
    if (path === '/pulls/7/merge' && options.method === 'POST') {
      return {merged: true};
    }
    if (path === '/pulls/7/comments' && options.method === 'POST') {
      return {id: 3, author: 'carol', body: JSON.parse(options.body).body};
    }
    if (path === '/pulls/7/comments') {
      return [
        {
          id: 1,
          author: 'erin',
          body: 'Please verify the slow split before merge.',
          file_path: 'train.jsonl',
          row_hash: 'abcdef123456',
          change_type: 'added',
          field_path: 'row:1',
          created_at: '2026-04-28T10:00:00Z',
        },
      ];
    }
    if (path === '/pulls/7/reviews' && options.method === 'POST') {
      const body = JSON.parse(options.body);
      return {id: 4, reviewer: 'carol', status: body.status};
    }
    if (path === '/pulls/7/reviews') {
      return [{id: 2, status: 'approved', created_at: '2026-04-28T10:30:00Z'}];
    }
    if (path === '/checks/sourcecommit123456') {
      return {
        checks: [
          {check_name: 'schema', status: 'pass', message: 'ML2 schema valid'},
          {check_name: 'toxicity', status: 'pass'},
        ],
      };
    }
    if (path === '/governance?target_branch=main') {
      return {
        repository: {
          permissions: {admin: true, push: true, pull: true},
          allow_merge_commits: true,
          allow_squash_merge: true,
          allow_fast_forward_only_merge: true,
          default_merge_style: 'squash',
        },
        reviewers: [{login: 'erin'}, {login: 'frank'}],
        current_user: {
          is_authenticated: true,
          can_merge: true,
          target_branch: 'main',
          login: 'carol',
        },
        branch_protections: [
          {
            rule_name: 'main',
            required_approvals: 1,
            enable_status_check: true,
            status_check_contexts: ['schema', 'toxicity'],
            block_on_rejected_reviews: true,
            block_on_official_review_requests: true,
            enable_merge_whitelist: true,
            merge_whitelist_usernames: ['release-manager'],
            enable_push: true,
            enable_push_whitelist: true,
            push_whitelist_usernames: ['data-admin'],
          },
        ],
        links: {
          settings: '/alice/dataset/settings',
          collaboration: '/alice/dataset/settings/collaboration',
          branches: '/alice/dataset/settings/branches',
        },
      };
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPullPage, {
    props: {owner: 'alice', repo: 'dataset', pullId: '7'},
    global: {stubs: {DataDiffView: diffStub}},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('Refresh safety SFT split'));
  await vi.waitFor(() => expect(wrapper.text()).toContain('2 checks passed'));

  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls/7');
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls/7/comments');
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls/7/reviews');
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/checks/sourcecommit123456');
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/governance?target_branch=main');
  expect(wrapper.text()).toContain('DIT pull request');
  expect(wrapper.text()).toContain('#7');
  expect(wrapper.text()).toContain('Open');
  expect(wrapper.text()).toContain('carol wants to merge safety-refresh into main');
  expect(wrapper.text()).toContain('Conversation 1');
  expect(wrapper.text()).toContain('Commits 1');
  expect(wrapper.text()).toContain('Checks 2');
  expect(wrapper.text()).toContain('Files changed 3');
  expect(wrapper.text()).toContain('+12');
  expect(wrapper.text()).toContain('-3');
  expect(wrapper.text()).toContain('~4');
  expect(wrapper.text()).toContain('carol opened this data pull request');
  expect(wrapper.text()).toContain('erin commented on train.jsonl');
  expect(wrapper.text()).toContain('added row:1');
  expect(wrapper.text()).toContain('1 approval');
  expect(wrapper.text()).toContain('2 checks passed');
  expect(wrapper.text()).toContain('This branch has no conflicts with the base branch.');
  expect(wrapper.text()).toContain('Merge data pull request');
  await vi.waitFor(() => expect(wrapper.find('.datahub-merge-button').attributes('disabled')).toBeUndefined());
  expect(wrapper.text()).toContain('schema');
  expect(wrapper.text()).toContain('ML2 schema valid');
  expect(wrapper.text()).toContain('Diff targetcommit123456..sourcecommit123456');
  expect(wrapper.text()).toContain('review');
  expect(wrapper.text()).toContain('carol');
  expect(wrapper.text()).toContain('Repository governance');
  expect(wrapper.text()).toContain('Admin access, Can push, Can read, Can merge');
  expect(wrapper.text()).toContain('squash default; merge commit, squash, fast-forward');
  expect(wrapper.text()).toContain('main: 1 required approval');
  expect(wrapper.text()).toContain('schema, toxicity');
  expect(wrapper.text()).toContain('review requests must be resolved');
  expect(wrapper.text()).toContain('release-manager');
  expect(wrapper.text()).toContain('data-admin');
  expect(wrapper.text()).toContain('erin, frank');
  expect(wrapper.find('a[href="/alice/dataset/settings/collaboration"]').exists()).toBe(true);
  expect(wrapper.find('a[href="/alice/dataset/settings/branches"]').exists()).toBe(true);
  expect(wrapper.find('.datahub-pr-summary-bar').exists()).toBe(false);
  expect(wrapper.find('.datahub-pull-page').classes()).not.toContain('is-files-tab');

  const filesTab = wrapper.findAll('.datahub-pr-tab').find((tab) => tab.text().includes('Files changed'));
  await filesTab.trigger('click');
  expect(wrapper.find('.datahub-pull-page').classes()).toContain('is-files-tab');
  await wrapper.find('.emit-row-comment').trigger('click');
  expect(wrapper.text()).toContain('Conversation 2');
  await wrapper.findAll('.datahub-pr-tab').find((tab) => tab.text().includes('Conversation')).trigger('click');
  expect(wrapper.text()).toContain('Inline row concern');
  expect(wrapper.text()).toContain('row rowabc1');

  await wrapper.find('#datahub-pr-comment').setValue('Looks ready for data review.');
  await wrapper.find('.datahub-comment-form').trigger('submit');
  await vi.waitFor(() => expect(wrapper.text()).toContain('Looks ready for data review.'));
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls/7/comments', {
    method: 'POST',
    body: JSON.stringify({author: 'carol', body: 'Looks ready for data review.'}),
  });

  await wrapper.find('#datahub-pr-review').setValue('Approved for merge.');
  await wrapper.find('.datahub-review-form select').setValue('approved');
  await wrapper.find('.datahub-review-form').trigger('submit');
  await vi.waitFor(() => expect(wrapper.text()).toContain('Approved for merge.'));
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls/7/reviews', {
    method: 'POST',
    body: JSON.stringify({status: 'approved'}),
  });
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls/7/comments', {
    method: 'POST',
    body: JSON.stringify({author: 'carol', body: 'Approved for merge.'}),
  });

  await wrapper.find('.datahub-merge-button').trigger('click');
  await vi.waitFor(() => expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls/7/merge', {
    method: 'POST',
    body: JSON.stringify({
      message: 'Merge pull request #7 from safety-refresh',
      author: 'carol',
    }),
  }));
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls/7');
});

test('disables merge for anonymous users even when the pull is otherwise mergeable', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/pulls/9') {
      return {
        id: 9,
        title: 'Ready import',
        status: 'open',
        source_branch: 'ready/import',
        target_branch: 'main',
        source_commit: 'sourcecommit',
        target_commit: 'targetcommit',
        is_mergeable: true,
      };
    }
    if (['/pulls/9/comments', '/pulls/9/reviews'].includes(path)) return [];
    if (path === '/checks/sourcecommit') return {checks: []};
    if (path === '/governance?target_branch=main') {
      return {
        repository: {
          permissions: {pull: true, push: false, admin: false},
          allow_merge_commits: true,
          default_merge_style: 'merge',
        },
        current_user: {is_authenticated: false, can_merge: false, target_branch: 'main'},
        reviewers: [],
        branch_protections: [],
        links: {},
      };
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPullPage, {
    props: {owner: 'alice', repo: 'dataset', pullId: '9'},
    global: {stubs: {DataDiffView: diffStub}},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('Ready import'));

  expect(wrapper.text()).toContain('Sign in to merge this data pull request.');
  expect(wrapper.text()).toContain('Sign in to comment or review this data pull request.');
  expect(wrapper.find('.datahub-comment-form').exists()).toBe(false);
  expect(wrapper.find('.datahub-review-form').exists()).toBe(false);
  await wrapper.findAll('.datahub-pr-tab').find((tab) => tab.text().includes('Files changed')).trigger('click');
  expect(wrapper.text()).toContain('read-only');
  expect(wrapper.find('.datahub-merge-button').attributes('disabled')).toBeDefined();
});

test('hides governance settings links for non-admin users', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/pulls/11') {
      return {
        id: 11,
        title: 'Writable review',
        status: 'open',
        source_branch: 'ready/import',
        target_branch: 'main',
        source_commit: 'sourcecommit',
        target_commit: 'targetcommit',
        is_mergeable: true,
      };
    }
    if (['/pulls/11/comments', '/pulls/11/reviews'].includes(path)) return [];
    if (path === '/checks/sourcecommit') return {checks: []};
    if (path === '/governance?target_branch=main') {
      return {
        repository: {
          permissions: {pull: true, push: true, admin: false},
          allow_merge_commits: true,
          default_merge_style: 'merge',
        },
        current_user: {is_authenticated: true, can_merge: true, target_branch: 'main', login: 'writer'},
        reviewers: [],
        branch_protections: [],
        links: {
          settings: '/alice/dataset/settings',
          collaboration: '/alice/dataset/settings/collaboration',
          branches: '/alice/dataset/settings/branches',
        },
      };
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPullPage, {
    props: {owner: 'alice', repo: 'dataset', pullId: '11'},
    global: {stubs: {DataDiffView: diffStub}},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('Writable review'));

  expect(wrapper.find('.datahub-comment-form').exists()).toBe(true);
  expect(wrapper.find('a[href="/alice/dataset/settings"]').exists()).toBe(false);
  expect(wrapper.find('a[href="/alice/dataset/settings/collaboration"]').exists()).toBe(false);
  expect(wrapper.find('a[href="/alice/dataset/settings/branches"]').exists()).toBe(false);
});

test('does not show permission blockers after a pull request is merged', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/pulls/12') {
      return {
        id: 12,
        title: 'Already merged',
        status: 'merged',
        source_branch: 'ready/import',
        target_branch: 'main',
        source_commit: 'sourcecommit',
        base_commit: 'basecommit',
        target_commit: 'sourcecommit',
        is_mergeable: true,
      };
    }
    if (['/pulls/12/comments', '/pulls/12/reviews'].includes(path)) return [];
    if (path === '/checks/sourcecommit') return {checks: []};
    if (path === '/governance?target_branch=main') {
      return {
        repository: {
          permissions: {pull: true, push: false, admin: false},
          allow_merge_commits: true,
          default_merge_style: 'merge',
        },
        current_user: {is_authenticated: true, can_merge: false, target_branch: 'main'},
        reviewers: [],
        branch_protections: [],
        links: {},
      };
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPullPage, {
    props: {owner: 'alice', repo: 'dataset', pullId: '12'},
    global: {stubs: {DataDiffView: diffStub}},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('Already merged'));

  expect(wrapper.text()).toContain('Pull request merged');
  expect(wrapper.text()).toContain('The data changes from this pull request have already been merged.');
  expect(wrapper.text()).toContain('basecom..sourcec');
  await wrapper.findAll('.datahub-pr-tab').find((tab) => tab.text().includes('Files changed')).trigger('click');
  expect(wrapper.text()).toContain('Diff basecommit..sourcecommit');
  expect(wrapper.find('.datahub-merge-button').attributes('disabled')).toBeDefined();
  expect(wrapper.text()).not.toContain('You do not have permission to merge into this branch.');
  expect(wrapper.text()).not.toContain('Only open pull requests can be merged.');
});

test('disables merge when branch protection gates are not satisfied', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/pulls/10') {
      return {
        id: 10,
        title: 'Needs review',
        status: 'open',
        source_branch: 'needs/review',
        target_branch: 'main',
        source_commit: 'sourcecommit',
        target_commit: 'targetcommit',
        is_mergeable: true,
      };
    }
    if (path === '/pulls/10/comments') return [];
    if (path === '/pulls/10/reviews') return [{id: 1, status: 'changes_requested'}];
    if (path === '/checks/sourcecommit') return {checks: [{check_name: 'schema', status: 'pass'}]};
    if (path === '/governance?target_branch=main') {
      return {
        repository: {
          permissions: {pull: true, push: true, admin: false},
          allow_merge_commits: true,
          default_merge_style: 'merge',
        },
        current_user: {is_authenticated: true, can_merge: true, target_branch: 'main'},
        reviewers: [],
        branch_protections: [{
          rule_name: 'main',
          required_approvals: 2,
          enable_status_check: true,
          status_check_contexts: ['schema', 'toxicity'],
          block_on_rejected_reviews: true,
        }],
        links: {},
      };
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPullPage, {
    props: {owner: 'alice', repo: 'dataset', pullId: '10'},
    global: {stubs: {DataDiffView: diffStub}},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('Needs review'));

  expect(wrapper.text()).toContain('Required checks have not passed.');
  expect(wrapper.text()).toContain('2 required approvals needed.');
  expect(wrapper.find('.datahub-merge-button').attributes('disabled')).toBeDefined();
});

test('renders files changed placeholder when pull request has no comparable commits yet', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/pulls/8') {
      return {
        id: 8,
        title: 'Draft import review',
        status: 'closed',
        source_branch: 'draft/import',
        target_branch: 'main',
      };
    }
    if (['/pulls/8/comments', '/pulls/8/reviews'].includes(path)) return [];
    if (path === '/governance') return null;
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPullPage, {
    props: {owner: 'alice', repo: 'dataset', pullId: '8'},
    global: {stubs: {DataDiffView: diffStub}},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('Draft import review'));

  expect(wrapper.text()).toContain('Closed');
  expect(wrapper.text()).toContain('No comparable DIT commits are available for this pull request yet.');
  expect(wrapper.find('.data-diff-stub').exists()).toBe(false);
});
