import {mount} from '@vue/test-utils';
import {expect, test, vi} from 'vitest';
import DataDiffView from './DataDiffView.vue';
import {datahubFetch} from '../utils/datahub-api.js';

vi.mock('../utils/datahub-api.js', () => ({
  datahubFetch: vi.fn(),
}));

test('loads row-inclusive diff and renders ML2 rows structurally', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
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

test('renders github-like files changed controls and reviewed progress in review mode', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/diff/old123/new456') {
      return {
        summary: {files_changed: 2, rows_added: 3, rows_removed: 1, rows_refreshed: 0},
        files: [
          {
            path: 'multi_turn/fast/chunk_000.jsonl',
            added: 2,
            removed: 0,
            refreshed: 0,
            added_rows: [
              {row_hash: 'row-1', content: {messages: [{role: 'user', content: 'hello'}]}},
            ],
          },
          {
            path: 'single_turn/slow/chunk_001.jsonl',
            added: 1,
            removed: 1,
            refreshed: 0,
            added_rows: [],
            removed_rows: [],
          },
        ],
      };
    }
    if (path === '/meta/diff/old123/new456') return {files: []};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataDiffView, {
    props: {owner: 'alice', repo: 'dataset', oldCommit: 'old123', newCommit: 'new456', reviewMode: true},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('multi_turn/fast/chunk_000.jsonl'));

  expect(wrapper.text()).toContain('Files changed');
  expect(wrapper.text()).toContain('Viewed 0 of 2 files');
  expect(wrapper.text()).toContain('Hide viewed');
  expect(wrapper.text()).toContain('Whitespace');
  expect(wrapper.text()).toContain('Viewed');

  await wrapper.find('input[type="checkbox"]').setValue(true);

  expect(wrapper.text()).toContain('Viewed 1 of 2 files');
});

test('offers a prefilled issue link for a changed data row', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/diff/old123/new456') {
      return {
        summary: {files_changed: 1, rows_added: 1, rows_removed: 0, rows_refreshed: 0},
        files: [
          {
            path: 'multi_turn/fast/chunk_000.jsonl',
            added: 1,
            removed: 0,
            refreshed: 0,
            added_rows: [
              {
                row_hash: '37655963d03826acf27a3217ef2d5a8dc1e79cc6b903f46c518fe2bf79639b84',
                position: 0,
                content: {messages: [{role: 'user', content: 'hello'}]},
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

  await vi.waitFor(() => expect(wrapper.text()).toContain('hello'));

  const link = wrapper.find('a.datahub-row-issue-link');
  expect(link.exists()).toBe(true);
  expect(link.attributes('href')).toContain('/alice/dataset/issues/new?');
  const issueUrl = new URL(link.attributes('href'), 'http://localhost');
  expect(issueUrl.searchParams.get('body')).toContain('row_hash: 37655963d03826acf27a3217ef2d5a8dc1e79cc6b903f46c518fe2bf79639b84');
  expect(issueUrl.searchParams.get('body')).toContain('path: multi_turn/fast/chunk_000.jsonl');
  expect(issueUrl.searchParams.get('body')).toContain('commit: new456');
});

test('submits a pull request row comment with file and row context', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path, options = {}) => {
    if (path === '/diff/old123/new456') {
      return {
        summary: {files_changed: 1, rows_added: 1, rows_removed: 0, rows_refreshed: 0},
        files: [
          {
            path: 'multi_turn/fast/chunk_000.jsonl',
            added: 1,
            removed: 0,
            refreshed: 0,
            added_rows: [
              {
                row_hash: 'rowhash1234567890',
                position: 4,
                content: {messages: [{role: 'user', content: 'needs review'}]},
              },
            ],
          },
        ],
      };
    }
    if (path === '/meta/diff/old123/new456') return {files: []};
    if (path === '/pulls/7/comments' && options.method === 'POST') {
      return {id: 11, author: 'reviewer1', ...JSON.parse(options.body)};
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataDiffView, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      oldCommit: 'old123',
      newCommit: 'new456',
      reviewMode: true,
      pullId: '7',
      currentUser: 'reviewer1',
    },
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('needs review'));

  await wrapper.find('.datahub-row-review-item button.datahub-row-comment-button').trigger('click');
  await wrapper.find('textarea.datahub-inline-comment-textarea').setValue('This row has a weak answer.');
  await wrapper.find('form.datahub-inline-comment-form').trigger('submit');

  await vi.waitFor(() => expect(wrapper.emitted('comment-created')?.[0]?.[0]).toMatchObject({
    id: 11,
    author: 'reviewer1',
    body: 'This row has a weak answer.',
    file_path: 'multi_turn/fast/chunk_000.jsonl',
    row_hash: 'rowhash1234567890',
    change_type: 'added',
    field_path: 'row:5',
  }));

  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls/7/comments', {
    method: 'POST',
    body: JSON.stringify({
      author: 'reviewer1',
      body: 'This row has a weak answer.',
      file_path: 'multi_turn/fast/chunk_000.jsonl',
      row_hash: 'rowhash1234567890',
      change_type: 'added',
      field_path: 'row:5',
    }),
  });
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
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
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
