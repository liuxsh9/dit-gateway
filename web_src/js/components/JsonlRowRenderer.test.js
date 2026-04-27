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
  expect(wrapper.text()).toContain('reasoning_content');
  expect(wrapper.text()).toContain('lookup');
  expect(wrapper.text()).toContain('"query": "天气"');
  expect(wrapper.text()).toContain('extra fields');
  expect(wrapper.text()).toContain('"vendor_score": 0.98');
  expect(wrapper.text()).toContain('row fields: difficulty');
});
