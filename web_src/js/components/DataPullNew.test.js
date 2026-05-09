import {mount} from '@vue/test-utils';
import {expect, test, vi} from 'vitest';
import DataPullNew from './DataPullNew.vue';
import {datahubFetch} from '../utils/datahub-api.js';

vi.mock('../utils/datahub-api.js', () => ({
  datahubFetch: vi.fn(),
}));

test('prefills a new data pull request from the default pull request template', async () => {
  window.history.pushState({}, '', '/alice/dataset/data/pulls/new?source=feature/sft&target=main');
  datahubFetch.mockImplementation(async (_owner, _repo, path, options) => {
    if (path === '/refs') {
      return [
        {name: 'heads/main'},
        {name: 'heads/feature/sft'},
      ];
    }
    if (path === '/templates/default?kind=pull_request') {
      return {name: 'Dataset review', content: '## Checklist\n- [ ] Source reviewed'};
    }
    if (path === '/pulls' && options?.method === 'POST') {
      expect(JSON.parse(options.body)).toEqual({
        title: 'Dataset review',
        description: '## Checklist\n- [ ] Source reviewed',
        source_branch: 'feature/sft',
        target_branch: 'main',
      });
      return {id: 42};
    }
    throw new Error(`unexpected request ${path}`);
  });
  const oldLocation = window.location;
  delete window.location;
  window.location = {href: ''};

  const wrapper = mount(DataPullNew, {
    props: {owner: 'alice', repo: 'dataset', defaultBranch: 'main'},
  });

  await vi.waitFor(() => expect(wrapper.find('textarea[name="body"]').element.value).toContain('Source reviewed'));
  expect(wrapper.find('input[name="title"]').element.value).toBe('Dataset review');

  await wrapper.find('form').trigger('submit.prevent');

  expect(window.location.href).toBe('/alice/dataset/data/pulls/42');
  window.location = oldLocation;
  window.history.pushState({}, '', '/');
});
