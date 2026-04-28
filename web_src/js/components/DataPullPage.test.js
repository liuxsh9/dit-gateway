import {mount} from '@vue/test-utils';
import {expect, test, vi} from 'vitest';

vi.mock('../utils/datahub-api.js', () => ({
  datahubFetch: vi.fn(),
}));

import DataPullPage from './DataPullPage.vue';
import {datahubFetch} from '../utils/datahub-api.js';

const diffStub = {
  name: 'DataDiffView',
  props: ['owner', 'repo', 'oldCommit', 'newCommit'],
  template: '<div class="data-diff-stub">Diff {{ oldCommit }}..{{ newCommit }}</div>',
};

test('loads a dit pull request detail page with conversation commits and files sections', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
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
      };
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPullPage, {
    props: {owner: 'alice', repo: 'dataset', pullId: '7'},
    global: {stubs: {DataDiffView: diffStub}},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('Refresh safety SFT split'));

  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls/7');
  expect(wrapper.text()).toContain('DIT pull request');
  expect(wrapper.text()).toContain('#7');
  expect(wrapper.text()).toContain('Open');
  expect(wrapper.text()).toContain('Mergeable');
  expect(wrapper.text()).toContain('carol wants to merge safety-refresh into main');
  expect(wrapper.text()).toContain('Conversation');
  expect(wrapper.text()).toContain('Commits');
  expect(wrapper.text()).toContain('Files changed');
  expect(wrapper.text()).toContain('+12');
  expect(wrapper.text()).toContain('-3');
  expect(wrapper.text()).toContain('~4');
  expect(wrapper.text()).toContain('Diff targetcommit123456..sourcecommit123456');
});

test('renders files changed placeholder when pull request has no comparable commits yet', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/pulls/8') {
      return {
        id: 8,
        title: 'Draft import review',
        status: 'closed',
        source_branch: 'draft/import',
        target_branch: 'main',
      };
    }
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
