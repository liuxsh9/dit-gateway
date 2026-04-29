import {mount} from '@vue/test-utils';
import {expect, test} from 'vitest';

import JsonlRowRenderer from './JsonlRowRenderer.vue';

test('renders ML2 content parts and collapsible structured fields', () => {
  const wrapper = mount(JsonlRowRenderer, {
    props: {
      rowNumber: 7,
      row: {
        version: '2.0.0',
        __datahubRowHash: 'abcdef123456',
        meta_info: {
          teacher: 'glm-5-thinking',
          language: 'zh',
          category: 'agent',
          rounds: 2,
        },
        messages: [
          {
            role: 'user',
            content: [
              {type: 'text', text: '第一段'},
              {type: 'text', text: '第二段'},
            ],
            name: 'reviewer',
          },
          {
            role: 'assistant',
            content: '我会查询。',
            reasoning_content: [{type: 'text', text: '需要调用工具'}],
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {name: 'lookup', arguments: '{"query":"天气"}'},
              },
            ],
            vendor_score: 0.98,
          },
        ],
        difficulty: 'medium',
      },
    },
  });

  expect(wrapper.text()).toContain('Row 7');
  expect(wrapper.text()).toContain('ML 2.0.0');
  expect(wrapper.text()).toContain('#abcdef12');
  expect(wrapper.text()).toContain('teacher: glm-5-thinking');
  expect(wrapper.text()).toContain('第一段\n第二段');
  expect(wrapper.text()).toContain('name: reviewer');
  expect(wrapper.text()).not.toContain('empty content');
  expect(wrapper.text()).toContain('reasoning_content');
  expect(wrapper.text()).toContain('lookup');
  expect(wrapper.text()).toContain('"query": "天气"');
  expect(wrapper.text()).toContain('extra fields');
  expect(wrapper.text()).toContain('"vendor_score": 0.98');
  expect(wrapper.text()).toContain('row fields: difficulty');
});

test('surfaces reasoning content and tool calls as reviewable message fields', () => {
  const longReasoning = [
    'I need to inspect the repository layout before editing.',
    'Then I will identify the failing component.',
    'After that I will write a focused test.',
    'Next I will make the smallest UI change.',
    'Finally I will verify the preview page.',
    'This extra line should be collapsed behind a field toggle.',
  ].join('\n');
  const wrapper = mount(JsonlRowRenderer, {
    props: {
      rowNumber: 9,
      row: {
        version: '2.0.0',
        meta_info: {
          teacher: 'glm-5-thinking',
          query_source: 'demo',
          response_generate_time: '2026-04-28',
          response_update_time: '2026-04-28',
          owner: 'data',
          language: 'en',
          category: 'agent',
          rounds: 1,
        },
        messages: [
          {
            role: 'assistant',
            content: 'I will inspect the repository.',
            reasoning_content: longReasoning,
            tool_calls: [
              {
                id: 'call_editor',
                type: 'function',
                function: {name: 'str_replace_editor', arguments: '{"command":"view","path":"/workspace/app"}'},
              },
            ],
          },
        ],
      },
    },
  });

  expect(wrapper.find('details.datahub-sft-details').exists()).toBe(false);
  expect(wrapper.find('.datahub-sft-field-reasoning').text()).toContain('reasoning_content');
  expect(wrapper.find('.datahub-sft-field-reasoning').text()).toContain('I need to inspect the repository layout');
  expect(wrapper.find('.datahub-sft-field-tools').text()).toContain('tool_calls');
  expect(wrapper.find('.datahub-sft-field-tools').text()).toContain('str_replace_editor');
  expect(wrapper.find('.datahub-sft-field-tools').text()).toContain('call_editor');
  expect(wrapper.find('.datahub-sft-field-collapsed').exists()).toBe(true);
  expect(wrapper.text()).toContain('Show full reasoning_content');
});

test('summarizes message counts by role', () => {
  const wrapper = mount(JsonlRowRenderer, {
    props: {
      rowNumber: 5,
      row: {
        version: '2.0.0',
        meta_info: {
          teacher: 'glm-5-thinking',
          query_source: 'demo',
          response_generate_time: '2026-04-28',
          response_update_time: '2026-04-28',
          owner: 'data',
          language: 'en',
          category: 'tool',
          rounds: 2,
        },
        messages: [
          {role: 'system', content: 'Follow the policy.'},
          {role: 'developer', content: 'Use compact output.'},
          {role: 'user', content: 'Question'},
          {role: 'assistant', content: 'Answer', tool_calls: [{id: 'call_1', function: {name: 'search', arguments: '{}'}}]},
          {role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}'},
          {role: 'assistant', content: 'Final answer'},
        ],
      },
    },
  });

  const counts = wrapper.find('.datahub-sft-row-counts').text();
  expect(counts).toContain('6 messages');
  expect(counts).toContain('system 1');
  expect(counts).toContain('user 1');
  expect(counts).toContain('assistant 2');
  expect(counts).toContain('tool 1');
  expect(counts).toContain('developer 1');
});

test('surfaces ML2 schema warnings and collapses long message content', () => {
  const longContent = ['line 1', 'line 2', 'line 3', 'line 4', 'line 5', 'line 6'].join('\n');
  const wrapper = mount(JsonlRowRenderer, {
    props: {
      rowNumber: 3,
      row: {
        version: '2.0.0',
        meta_info: {
          teacher: 'glm-5-thinking',
          language: 'zh',
        },
        messages: [
          {role: 'user', content: longContent},
          {
            role: 'assistant',
            tool_calls: [
              {id: 'call_weather', type: 'function', function: {name: 'get_weather', arguments: '{}'}},
            ],
          },
          {role: 'tool', tool_call_id: 'call_missing', content: '{"ok":true}'},
        ],
      },
    },
  });

  expect(wrapper.text()).toContain('8 warnings');
  expect(wrapper.text()).toContain('meta_info.query_source is missing');
  expect(wrapper.text()).toContain('assistant message 2 is missing content');
  expect(wrapper.text()).toContain('tool message 3 references unknown tool_call_id call_missing');
  expect(wrapper.find('.datahub-sft-content-collapsed').exists()).toBe(true);
  expect(wrapper.text()).toContain('Show full content');
});

test('can collapse whitespace for dense row review', () => {
  const wrapper = mount(JsonlRowRenderer, {
    props: {
      rowNumber: 1,
      collapseWhitespace: true,
      row: {
        version: '2.0.0',
        meta_info: {
          teacher: 'glm-5-thinking',
          query_source: 'demo',
          response_generate_time: '2026-04-28',
          response_update_time: '2026-04-28',
          owner: 'data',
          language: 'en',
          category: 'chat',
          rounds: 1,
        },
        messages: [
          {role: 'user', content: 'line 1\n\n   line 2'},
          {role: 'assistant', content: [{type: 'text', text: 'answer\n  with   spaces'}]},
        ],
      },
    },
  });

  expect(wrapper.text()).toContain('line 1 line 2');
  expect(wrapper.text()).toContain('answer with spaces');
  expect(wrapper.text()).not.toContain('line 1\n\n   line 2');
});
