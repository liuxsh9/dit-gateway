import {mount} from '@vue/test-utils';
import {expect, test, vi} from 'vitest';

vi.mock('../utils/datahub-api.js', () => ({
  datahubFetch: vi.fn(),
}));

import DataCommitPage from './DataCommitPage.vue';
import {datahubFetch} from '../utils/datahub-api.js';

const diffStub = {
  name: 'DataDiffView',
  props: ['owner', 'repo', 'oldCommit', 'newCommit'],
  template: '<div class="data-diff-stub">Diff {{ oldCommit }}..{{ newCommit }}</div>',
};

test('shows a dit commit header and renders diff against its first parent', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/objects/commits/abcdef1234567890') {
      return {
        commit_hash: 'abcdef1234567890',
        parent_hashes: ['parent1234567890'],
        author: 'alice',
        message: 'refresh safety split',
        timestamp: 1713600000,
      };
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataCommitPage, {
    props: {owner: 'alice', repo: 'dataset', commitHash: 'abcdef1234567890'},
    global: {stubs: {DataDiffView: diffStub}},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('refresh safety split'));

  expect(wrapper.text()).toContain('DIT commit');
  expect(wrapper.text()).toContain('abcdef1');
  expect(wrapper.text()).toContain('alice');
  expect(wrapper.text()).toContain('Diff parent1234567890..abcdef1234567890');
  expect(wrapper.find('a[href="/alice/dataset/data/commits/main"]').exists()).toBe(true);
});

test('renders root commit state without requesting a parent diff', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/objects/commits/root1234567890') {
      return {
        commit_hash: 'root1234567890',
        parent_hashes: [],
        author: 'alice',
        message: 'initial dataset',
        timestamp: 1713600000,
      };
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataCommitPage, {
    props: {owner: 'alice', repo: 'dataset', commitHash: 'root1234567890'},
    global: {stubs: {DataDiffView: diffStub}},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('initial dataset'));

  expect(wrapper.text()).toContain('This is the first DIT commit');
  expect(wrapper.find('.data-diff-stub').exists()).toBe(false);
});

