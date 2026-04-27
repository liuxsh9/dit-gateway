import {mount} from '@vue/test-utils';
import {expect, test, vi} from 'vitest';

vi.mock('../utils/datahub-api.js', () => ({
  datahubFetch: vi.fn(),
}));

import JsonlViewer from './JsonlViewer.vue';
import {datahubFetch} from '../utils/datahub-api.js';

test('loads paged manifest entries and row objects from core API', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/manifest/commit123/train.jsonl?offset=0&limit=50') {
      return {
        total: 2,
        entries: [
          {row_hash: 'row1'},
          {row_hash: 'row2'},
        ],
      };
    }
    if (path === '/objects/rows/row1') return {instruction: 'Explain LRU', response: 'Evict least recent'};
    if (path === '/objects/rows/row2') return {instruction: 'Explain LFU', response: 'Evict least frequent'};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(JsonlViewer, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'commit123',
      filePath: 'train.jsonl',
    },
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('Explain LRU'));

  expect(datahubFetch).toHaveBeenCalledWith(
    'alice',
    'dataset',
    '/manifest/commit123/train.jsonl?offset=0&limit=50',
  );
  expect(wrapper.text()).toContain('2 rows');
  expect(wrapper.text()).toContain('Explain LFU');
});
