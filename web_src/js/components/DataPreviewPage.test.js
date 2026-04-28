import {mount} from '@vue/test-utils';
import {expect, test} from 'vitest';

import DataPreviewPage from './DataPreviewPage.vue';

const viewerStub = {
  name: 'JsonlViewer',
  props: ['owner', 'repo', 'commitHash', 'filePath'],
  template: '<div class="jsonl-viewer-stub">Viewer {{ commitHash }} / {{ filePath }}</div>',
};

test('mounts a dedicated JSONL preview page with breadcrumbs back to summary and commit', () => {
  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'abcdef1234567890',
      filePath: 'train/sft.jsonl',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });

  expect(wrapper.text()).toContain('JSONL preview');
  expect(wrapper.text()).toContain('train/sft.jsonl');
  expect(wrapper.text()).toContain('Viewer abcdef1234567890 / train/sft.jsonl');
  expect(wrapper.find('a[href="/alice/dataset"]').exists()).toBe(true);
  expect(wrapper.find('a[href="/alice/dataset/data/commit/abcdef1234567890"]').exists()).toBe(true);
});

