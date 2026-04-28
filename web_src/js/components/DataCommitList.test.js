import {mount} from '@vue/test-utils';
import {expect, test, vi} from 'vitest';

vi.mock('../utils/datahub-api.js', () => ({
  datahubFetch: vi.fn(),
}));

import DataCommitList from './DataCommitList.vue';
import {datahubFetch} from '../utils/datahub-api.js';

test('loads dit commit history for a branch and links each row to its detail page', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/log?ref=heads/main&limit=50') {
      return {
        commits: [
          {
            commit_hash: 'abcdef1234567890',
            parent_hashes: ['parent1234567890'],
            author: 'alice',
            message: 'refresh safety split',
            timestamp: 1713600000,
          },
          {
            commit_hash: 'fedcba9876543210',
            parent_hash: 'base1234567890',
            author: 'bob',
            message: 'add seed examples',
            timestamp: 1713513600,
          },
        ],
      };
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataCommitList, {
    props: {owner: 'alice', repo: 'dataset', branch: 'main'},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('refresh safety split'));

  expect(wrapper.text()).toContain('DIT commits');
  expect(wrapper.text()).toContain('heads/main');
  expect(wrapper.text()).toContain('alice');
  expect(wrapper.text()).toContain('bob');
  expect(wrapper.find('a[href="/alice/dataset/data/commit/abcdef1234567890"]').exists()).toBe(true);
  expect(wrapper.find('a[href="/alice/dataset/data/commit/fedcba9876543210"]').exists()).toBe(true);
});

