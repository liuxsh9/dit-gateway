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

test('orders common SFT columns before incidental JSON fields', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/manifest/commit123/train.jsonl?offset=0&limit=50') {
      return {
        total: 1,
        entries: [
          {row_hash: 'row1'},
        ],
      };
    }
    if (path === '/objects/rows/row1') {
      return {
        metadata: {source: 'manual'},
        response: 'A cache eviction policy.',
        instruction: 'Explain LRU',
        messages: [{role: 'user', content: 'Explain LRU'}],
      };
    }
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

  expect(wrapper.vm.columns).toEqual(['instruction', 'response', 'messages', 'metadata']);
});

test('renders ML2 message rows as conversation cards instead of JSON strings', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/manifest/commit123/train.jsonl?offset=0&limit=50') {
      return {
        total: 1,
        entries: [
          {row_hash: 'row1'},
        ],
      };
    }
    if (path === '/objects/rows/row1') {
      return {
        version: '2.0.0',
        meta_info: {
          teacher: 'glm-5-thinking',
          language: 'zh',
          category: 'agent',
          rounds: 1,
        },
        tools: [
          {
            type: 'function',
            function: {name: 'get_weather'},
          },
        ],
        messages: [
          {role: 'system', content: '你是一个实时天气助手。'},
          {role: 'user', content: '北京天气怎么样？'},
          {
            role: 'assistant',
            content: '',
            reasoning_content: '我需要先查天气。',
            tool_calls: [
              {
                id: 'call_weather',
                type: 'function',
                function: {name: 'get_weather', arguments: '{"location":"Beijing"}'},
              },
            ],
          },
          {role: 'tool', tool_call_id: 'call_weather', content: '{"temperature":"22C"}'},
          {role: 'assistant', content: '北京现在约 22C。', weight: 1},
        ],
      };
    }
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
  await vi.waitFor(() => expect(wrapper.text()).toContain('北京天气怎么样？'));

  expect(wrapper.find('.datahub-sft-row-card').exists()).toBe(true);
  expect(wrapper.find('.datahub-jsonl-table').exists()).toBe(false);
  expect(wrapper.text()).toContain('system');
  expect(wrapper.text()).toContain('user');
  expect(wrapper.text()).toContain('assistant');
  expect(wrapper.text()).toContain('tool');
  expect(wrapper.text()).toContain('get_weather');
  expect(wrapper.text()).toContain('call_weather');
  expect(wrapper.text()).toContain('teacher: glm-5-thinking');
  expect(wrapper.text()).not.toContain('"messages":');
});
