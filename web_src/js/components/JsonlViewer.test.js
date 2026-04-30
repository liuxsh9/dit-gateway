import {mount} from '@vue/test-utils';
import {afterEach, expect, test, vi} from 'vitest';
import JsonlViewer from './JsonlViewer.vue';
import {datahubFetch} from '../utils/datahub-api.js';

vi.mock('../utils/datahub-api.js', () => ({
  datahubFetch: vi.fn(),
}));

global.fetch = vi.fn(async () => ({
  ok: true,
  json: async () => [],
}));

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => [],
  }));
});

test('loads paged manifest entries and row objects from core API', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
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

test('shows visible loading context while preview rows are loading', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/manifest/commit123/train.jsonl?offset=0&limit=50') {
      return new Promise(() => {});
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(JsonlViewer, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'commit123',
      filePath: 'train.jsonl',
      singleRowMode: true,
    },
  });

  await vi.waitFor(() => expect(datahubFetch).toHaveBeenCalledWith(
    'alice',
    'dataset',
    '/manifest/commit123/train.jsonl?offset=0&limit=50',
  ));

  expect(wrapper.text()).toContain('Loading rows');
  expect(wrapper.text()).toContain('Fetching the first 50 JSONL rows.');

  wrapper.unmount();
});

test('renders inline manifest rows without fetching placeholder row hashes', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/manifest/commit123/eval.jsonl?offset=0&limit=50') {
      return {
        total: 1,
        entries: [
          {
            row_hash: 'row-0',
            content: {
              version: '2.0.0',
              messages: [
                {role: 'user', content: 'Inline question'},
                {role: 'assistant', content: 'Inline answer'},
              ],
            },
          },
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
      filePath: 'eval.jsonl',
      singleRowMode: true,
    },
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('Inline question'));

  expect(wrapper.text()).toContain('Inline answer');
  expect(datahubFetch).not.toHaveBeenCalledWith('alice', 'dataset', '/objects/rows/row-0');
});

test('orders common SFT columns before incidental JSON fields', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
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
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
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

test('supports single-row review with quick row switching', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/manifest/commit123/train.jsonl?offset=0&limit=50') {
      return {
        total: 2,
        entries: [
          {row_hash: 'row1'},
          {row_hash: 'row2'},
        ],
      };
    }
    if (path === '/objects/rows/row1') {
      return {
        version: '2.0.0',
        meta_info: {teacher: 'model-a', language: 'zh', category: 'chat', rounds: 1},
        messages: [{role: 'user', content: '第一行问题'}, {role: 'assistant', content: '第一行回答'}],
      };
    }
    if (path === '/objects/rows/row2') {
      return {
        version: '2.0.0',
        meta_info: {teacher: 'model-b', language: 'en', category: 'tool', rounds: 1},
        messages: [{role: 'user', content: 'second question'}, {role: 'assistant', content: 'second answer'}],
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
      singleRowMode: true,
    },
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('第一行问题'));

  expect(wrapper.find('.datahub-row-index').exists()).toBe(true);
  expect(wrapper.text()).toContain('Row 1');
  expect(wrapper.text()).toContain('Row 2');
  expect(wrapper.text()).not.toContain('second answer');

  await wrapper.findAll('.datahub-row-index-item')[1].trigger('click');

  expect(wrapper.text()).toContain('second answer');
  expect(wrapper.text()).not.toContain('第一行回答');
});

test('resets selected row preview scroll when switching rows', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/manifest/commit123/train.jsonl?offset=0&limit=50') {
      return {
        total: 2,
        entries: [
          {row_hash: 'row1'},
          {row_hash: 'row2'},
        ],
      };
    }
    if (path === '/objects/rows/row1') {
      return {
        version: '2.0.0',
        messages: [
          {
            role: 'assistant',
            content: 'first row',
            reasoning_content: 'first reasoning '.repeat(300),
          },
        ],
      };
    }
    if (path === '/objects/rows/row2') {
      return {
        version: '2.0.0',
        messages: [
          {
            role: 'assistant',
            content: 'second row',
            reasoning_content: 'second reasoning '.repeat(300),
          },
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
      singleRowMode: true,
    },
    attachTo: document.body,
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('first row'));

  let selectedRow = wrapper.find('.datahub-selected-row').element;
  let nestedField = wrapper.find('.datahub-sft-field-content').element;
  selectedRow.scrollTop = 240;
  nestedField.scrollTop = 180;

  await wrapper.findAll('.datahub-row-index-item')[1].trigger('click');
  await wrapper.vm.$nextTick();
  await vi.waitFor(() => expect(wrapper.text()).toContain('second row'));

  selectedRow = wrapper.find('.datahub-selected-row').element;
  nestedField = wrapper.find('.datahub-sft-field-content').element;
  expect(selectedRow.scrollTop).toBe(0);
  expect(nestedField.scrollTop).toBe(0);

  wrapper.unmount();
});

test('keeps single-row pagination inside the row review workspace', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/manifest/commit123/train.jsonl?offset=0&limit=50') {
      return {
        total: 120,
        entries: [
          {
            row_hash: 'row1',
            content: {
              version: '2.0.0',
              messages: [
                {role: 'user', content: 'first page row'},
                {role: 'assistant', content: 'answer'},
              ],
            },
          },
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
      singleRowMode: true,
    },
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('first page row'));

  const review = wrapper.find('.datahub-row-review');
  expect(review.find('.datahub-row-index-list').exists()).toBe(true);
  expect(review.find('.datahub-row-pagination').exists()).toBe(true);
  expect(wrapper.find('.datahub-row-index > .datahub-row-pagination').exists()).toBe(true);
  expect(wrapper.findAll('.ui.bottom.attached.segment')).toHaveLength(0);
});

test('jumps directly to a row by loading the containing manifest page', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/manifest/commit123/train.jsonl?offset=0&limit=50') {
      return {total: 120, entries: [{row_hash: 'row1'}]};
    }
    if (path === '/objects/rows/row1') {
      return {messages: [{role: 'user', content: 'first page'}]};
    }
    if (path === '/manifest/commit123/train.jsonl?offset=50&limit=50') {
      return {total: 120, entries: [{row_hash: 'row51'}, {row_hash: 'row52'}, {row_hash: 'row53'}]};
    }
    if (path === '/objects/rows/row51') return {messages: [{role: 'user', content: 'row 51'}]};
    if (path === '/objects/rows/row52') return {messages: [{role: 'user', content: 'row 52'}]};
    if (path === '/objects/rows/row53') return {messages: [{role: 'user', content: 'target row 53'}]};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(JsonlViewer, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'commit123',
      filePath: 'train.jsonl',
      singleRowMode: true,
    },
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('first page'));

  await wrapper.find('[data-testid="datahub-row-jump-input"]').setValue('53');
  await wrapper.find('[data-testid="datahub-row-jump-form"] button').trigger('click');

  await vi.waitFor(() => expect(wrapper.text()).toContain('target row 53'));
  expect(wrapper.text()).toContain('Row 53');
  expect(datahubFetch).toHaveBeenCalledWith(
    'alice',
    'dataset',
    '/manifest/commit123/train.jsonl?offset=50&limit=50',
  );
});

test('searches the current JSONL file and lets reviewers jump to matching rows', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path, options) => {
    if (path === '/manifest/commit123/eval.jsonl?offset=0&limit=50') {
      return {total: 100, entries: [{row_hash: 'row1'}]};
    }
    if (path === '/objects/rows/row1') {
      return {messages: [{role: 'user', content: 'first row'}]};
    }
    if (path === '/search') {
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        ref: 'commit123',
        query: 'needle',
        file: 'eval.jsonl',
        limit: 50,
      });
      return {
        matches: [
          {
            file: 'eval.jsonl',
            row_index: 73,
            highlight: '...needle...',
            content: {messages: [{role: 'user', content: 'needle row'}]},
          },
        ],
        total_scanned: 74,
        limit_reached: false,
      };
    }
    if (path === '/manifest/commit123/eval.jsonl?offset=50&limit=50') {
      return {
        total: 100,
        entries: Array.from({length: 50}, (_, index) => ({row_hash: `row${51 + index}`})),
      };
    }
    if (path.startsWith('/objects/rows/row')) {
      const rowNumber = path.replace('/objects/rows/row', '');
      return {messages: [{role: 'user', content: rowNumber === '74' ? 'needle row' : `row ${rowNumber}`}]};
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(JsonlViewer, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'commit123',
      filePath: 'eval.jsonl',
      singleRowMode: true,
    },
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('first row'));

  await wrapper.find('[data-testid="datahub-row-search-input"]').setValue('needle');
  await wrapper.find('[data-testid="datahub-row-search-form"] button').trigger('click');
  await vi.waitFor(() => expect(wrapper.text()).toContain('1 match'));

  await wrapper.find('[data-testid="datahub-search-result-73"]').trigger('click');

  await vi.waitFor(() => expect(wrapper.text()).toContain('needle row'));
  expect(wrapper.text()).toContain('Row 74');
});

test('offers prefilled issue creation from a preview row and marks open linked issues', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/manifest/commit123/train/sft.jsonl?offset=0&limit=50') {
      return {
        total: 1,
        entries: [
          {row_hash: 'abc123def456'},
        ],
      };
    }
    if (path === '/objects/rows/abc123def456') {
      return {
        version: '2.0.0',
        meta_info: {
          owner: 'erin',
          query_source: 'human_eval',
        },
        messages: [
          {role: 'user', content: 'bad source row'},
          {role: 'assistant', content: 'answer'},
        ],
      };
    }
    throw new Error(`unexpected path ${path}`);
  });
  vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
    expect(String(url)).toContain('/api/v1/repos/alice/dataset/issues?');
    return {
      ok: true,
      json: async () => [
        {
          number: 17,
          title: '[Data issue] train/sft.jsonl row 1',
          state: 'open',
          html_url: '/alice/dataset/issues/17',
          body: [
            '<!-- datahub-row-context -->',
            'path: train/sft.jsonl',
            'commit: commit123',
            'row: 1',
            'row_hash: abc123def456',
          ].join('\n'),
        },
      ],
    };
  });

  const wrapper = mount(JsonlViewer, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'commit123',
      filePath: 'train/sft.jsonl',
      singleRowMode: true,
    },
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('bad source row'));
  await vi.waitFor(() => expect(wrapper.text()).toContain('1 open data issue'));

  const link = wrapper.find('a.datahub-preview-issue-link');
  expect(link.exists()).toBe(true);
  expect(link.attributes('target')).toBe('_blank');
  expect(link.attributes('rel')).toContain('noopener');
  expect(link.attributes('rel')).toContain('noreferrer');
  expect(link.attributes('href')).toContain('/alice/dataset/issues/new?');
  const issueUrl = new URL(link.attributes('href'), 'http://localhost');
  expect(issueUrl.searchParams.get('title')).toBe('[Data issue] train/sft.jsonl row 1');
  expect(issueUrl.searchParams.get('body')).toContain('<!-- datahub-row-context -->');
  expect(issueUrl.searchParams.get('body')).toContain('path: train/sft.jsonl');
  expect(issueUrl.searchParams.get('body')).toContain('commit: commit123');
  expect(issueUrl.searchParams.get('body')).toContain('row_hash: abc123def456');
  expect(issueUrl.searchParams.get('body')).toContain('responsible_owner: erin');
  expect(wrapper.find('.datahub-row-index-item.has-open-issue').exists()).toBe(true);
  expect(wrapper.emitted('open-issues-loaded')?.[0]?.[0]).toMatchObject({count: 1});
});
