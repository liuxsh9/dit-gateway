import {mount} from '@vue/test-utils';
import {expect, test, vi} from 'vitest';

vi.mock('../utils/datahub-api.js', () => ({
  datahubFetch: vi.fn(),
}));

import DataDiffView from './DataDiffView.vue';
import {datahubFetch} from '../utils/datahub-api.js';

test('loads row-inclusive diff and renders ML2 rows structurally', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/diff/old123/new456') {
      return {
        summary: {files_changed: 1, rows_added: 1, rows_removed: 0, rows_refreshed: 0},
        files: [
          {
            path: 'ml2.jsonl',
            added: 1,
            removed: 0,
            refreshed: 0,
            added_rows: [
              {
                row_hash: 'abcdef123456',
                content: {
                  version: '2.0.0',
                  meta_info: {
                    teacher: 'glm-5-thinking',
                    query_source: 'synthesized',
                    response_generate_time: '2026-03-03',
                    response_update_time: '2026-03-27',
                    owner: 'agent-team',
                    language: 'zh',
                    category: 'agent',
                    rounds: 1,
                  },
                  messages: [
                    {role: 'user', content: '北京天气怎么样？'},
                    {role: 'assistant', content: '北京现在约 22C。'},
                  ],
                },
              },
            ],
          },
        ],
      };
    }
    if (path === '/meta/diff/old123/new456') return {files: []};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataDiffView, {
    props: {owner: 'alice', repo: 'dataset', oldCommit: 'old123', newCommit: 'new456'},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('北京天气怎么样？'));

  expect(wrapper.text()).toContain('Files changed');
  expect(wrapper.text()).toContain('Rows added');
  expect(wrapper.find('.datahub-sft-row-card').exists()).toBe(true);
  expect(wrapper.find('pre.datahub-diff-content').exists()).toBe(false);
  expect(wrapper.text()).not.toContain('"messages":');
});

test('renders refreshed ML2 rows as before and after conversation cards', async () => {
  const baseRow = {
    version: '2.0.0',
    meta_info: {
      teacher: 'glm-5-thinking',
      query_source: 'synthesized',
      response_generate_time: '2026-03-03',
      response_update_time: '2026-03-27',
      owner: 'agent-team',
      language: 'zh',
      category: 'agent',
      rounds: 1,
    },
    messages: [
      {role: 'user', content: '解释快速排序。'},
    ],
  };
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/diff/old123/new456') {
      return {
        summary: {files_changed: 1, rows_added: 0, rows_removed: 0, rows_refreshed: 1},
        files: [
          {
            path: 'train.jsonl',
            added: 0,
            removed: 0,
            refreshed: 1,
            refreshed_rows: [
              {
                old_row_hash: 'oldhash123',
                new_row_hash: 'newhash456',
                old_content: {...baseRow, messages: [...baseRow.messages, {role: 'assistant', content: '旧回答'}]},
                new_content: {...baseRow, messages: [...baseRow.messages, {role: 'assistant', content: '新回答'}]},
              },
            ],
          },
        ],
      };
    }
    if (path === '/meta/diff/old123/new456') return {files: []};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataDiffView, {
    props: {owner: 'alice', repo: 'dataset', oldCommit: 'old123', newCommit: 'new456'},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('新回答'));

  expect(wrapper.text()).toContain('Before');
  expect(wrapper.text()).toContain('After');
  expect(wrapper.text()).toContain('旧回答');
  expect(wrapper.findAll('.datahub-sft-row-card')).toHaveLength(2);
});
