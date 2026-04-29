import {mount} from '@vue/test-utils';
import {afterEach, expect, test, vi} from 'vitest';
import DataPreviewPage from './DataPreviewPage.vue';
import {datahubFetch} from '../utils/datahub-api.js';

vi.mock('../utils/datahub-api.js', () => ({
  datahubFetch: vi.fn(),
}));

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

const viewerStub = {
  name: 'JsonlViewer',
  props: ['owner', 'repo', 'commitHash', 'filePath', 'singleRowMode'],
  emits: ['open-issues-loaded'],
  template: `
    <div class="jsonl-viewer-stub">
      Viewer {{ commitHash }} / {{ filePath }} / single={{ singleRowMode }}
      <button type="button" data-testid="emit-open-issues" @click="$emit('open-issues-loaded', {count: 2, href: '/alice/dataset/issues?q=datahub-row-context'})">emit</button>
    </div>
  `,
};

test('mounts a dedicated JSONL preview page with tree navigation and single-row review', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/tree/abcdef1234567890') {
      return {
        entries: [
          {name: 'train/sft.jsonl', obj_type: 'manifest'},
          {name: 'eval/hard.jsonl', obj_type: 'manifest'},
          {name: 'eval/safety/redteam.jsonl', obj_type: 'manifest'},
        ],
      };
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'abcdef1234567890',
      filePath: 'train/sft.jsonl',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('eval'));

  expect(wrapper.text()).toContain('JSONL preview');
  expect(wrapper.text()).toContain('train/sft.jsonl');
  expect(wrapper.text()).toContain('Files');
  expect(wrapper.text()).toContain('eval');
  expect(wrapper.findComponent(viewerStub).props('singleRowMode')).toBe(true);
  expect(wrapper.text()).toContain('Viewer abcdef1234567890 / train/sft.jsonl');
  expect(wrapper.find('a[href="/api/v1/repos/alice/dataset/datahub/export/abcdef1234567890/train/sft.jsonl"]').exists()).toBe(true);
  expect(wrapper.find('a[href="/alice/dataset"]').exists()).toBe(true);
  expect(wrapper.find('a[href="/alice/dataset/data/commit/abcdef1234567890"]').exists()).toBe(true);

  await wrapper.findAll('.datahub-tree-folder').find((button) => button.text() === 'eval').trigger('click');
  expect(wrapper.find('a[href="/alice/dataset/data/preview/abcdef1234567890/eval/hard.jsonl"]').exists()).toBe(true);
});

test('mounts the direct file preview before sidebar metadata finishes loading', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/tree/abcdef1234567890' || path === '/stats/abcdef1234567890') {
      return new Promise(() => {});
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'abcdef1234567890',
      filePath: 'stress/multi_turn/mixed/chunk_005.jsonl',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });

  await vi.waitFor(() => expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/tree/abcdef1234567890'));

  expect(wrapper.text()).toContain('Viewer abcdef1234567890 / stress/multi_turn/mixed/chunk_005.jsonl');
  expect(wrapper.text()).toContain('Loading file list');
  expect(wrapper.findComponent(viewerStub).props('singleRowMode')).toBe(true);

  wrapper.unmount();
});

test('renders the preview file tree from directory data while file statistics are still loading', async () => {
  datahubFetch.mockImplementation((_owner, _repo, path) => {
    if (path === '/tree/abcdef1234567890') {
      return Promise.resolve({
        entries: [
          {name: 'stress', obj_type: 'tree', obj_hash: 'stress-tree'},
          {name: 'stress-large', obj_type: 'tree', obj_hash: 'stress-large-tree'},
        ],
      });
    }
    if (path === '/tree/abcdef1234567890/stress') {
      return Promise.resolve({
        entries: [
          {name: 'single_turn', obj_type: 'tree', obj_hash: 'single-turn-tree'},
        ],
      });
    }
    if (path === '/tree/abcdef1234567890/stress/single_turn') {
      return Promise.resolve({
        entries: [
          {name: 'fast', obj_type: 'tree', obj_hash: 'fast-tree'},
        ],
      });
    }
    if (path === '/tree/abcdef1234567890/stress/single_turn/fast') {
      return Promise.resolve({
        entries: [
          {name: 'chunk_000.jsonl', obj_type: 'manifest', obj_hash: 'manifest-fast'},
        ],
      });
    }
    if (path === '/stats/abcdef1234567890') return new Promise(() => {});
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'abcdef1234567890',
      filePath: 'stress/single_turn/fast/chunk_000.jsonl',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('stress-large'));
  expect(wrapper.text()).not.toContain('Loading file list');
  await vi.waitFor(() => expect(wrapper.find('.datahub-tree-row.active').text()).toContain('chunk_000.jsonl'));
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/tree/abcdef1234567890/stress');
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/tree/abcdef1234567890/stress/single_turn');
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/tree/abcdef1234567890/stress/single_turn/fast');
  expect(wrapper.findComponent(viewerStub).props('filePath')).toBe('stress/single_turn/fast/chunk_000.jsonl');

  wrapper.unmount();
});

test('resolves a folder preview URL to the first manifest under that folder', async () => {
  datahubFetch.mockImplementation((_owner, _repo, path) => {
    if (path === '/tree/abcdef1234567890') {
      return Promise.resolve({
        entries: [
          {name: 'stress', obj_type: 'tree', obj_hash: 'stress-tree'},
          {name: 'stress-large', obj_type: 'tree', obj_hash: 'stress-large-tree'},
        ],
      });
    }
    if (path === '/tree/abcdef1234567890/stress') {
      return Promise.resolve({
        entries: [
          {name: 'multi_turn', obj_type: 'tree', obj_hash: 'multi-turn-tree'},
          {name: 'single_turn', obj_type: 'tree', obj_hash: 'single-turn-tree'},
        ],
      });
    }
    if (path === '/tree/abcdef1234567890/stress/multi_turn') {
      return Promise.resolve({
        entries: [
          {name: 'mixed', obj_type: 'tree', obj_hash: 'mixed-tree'},
        ],
      });
    }
    if (path === '/tree/abcdef1234567890/stress/multi_turn/mixed') {
      return Promise.resolve({
        entries: [
          {name: 'chunk_005.jsonl', obj_type: 'manifest', obj_hash: 'manifest-mixed'},
        ],
      });
    }
    if (path === '/stats/abcdef1234567890') return new Promise(() => {});
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'abcdef1234567890',
      filePath: 'stress',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });

  expect(wrapper.findComponent(viewerStub).exists()).toBe(false);
  await vi.waitFor(() => expect(wrapper.findComponent(viewerStub).exists()).toBe(true));
  expect(wrapper.findComponent(viewerStub).props('filePath')).toBe('stress/multi_turn/mixed/chunk_005.jsonl');
  expect(wrapper.text()).toContain('Viewer abcdef1234567890 / stress/multi_turn/mixed/chunk_005.jsonl');
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/tree/abcdef1234567890/stress');
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/tree/abcdef1234567890/stress/multi_turn');
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/tree/abcdef1234567890/stress/multi_turn/mixed');

  wrapper.unmount();
});

test('does not mount the JSONL viewer when a folder preview cannot resolve a manifest', async () => {
  datahubFetch.mockImplementation((_owner, _repo, path) => {
    if (path === '/tree/abcdef1234567890') {
      return Promise.resolve({
        entries: [
          {name: 'stress', obj_type: 'tree', obj_hash: 'stress-tree'},
        ],
      });
    }
    if (path === '/tree/abcdef1234567890/stress') {
      return Promise.resolve({entries: []});
    }
    if (path === '/stats/abcdef1234567890') return Promise.resolve({files: []});
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'abcdef1234567890',
      filePath: 'stress',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('No JSONL manifest files are available'));

  expect(wrapper.findComponent(viewerStub).exists()).toBe(false);

  wrapper.unmount();
});

test('resolves a branch-only preview URL to the first manifest file', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/refs/heads/main') return {target_hash: 'abcdef1234567890'};
    if (path === '/tree/abcdef1234567890') {
      return {
        entries: [
          {name: 'train/sft.jsonl', obj_type: 'manifest'},
          {name: 'eval/hard.jsonl', obj_type: 'manifest'},
        ],
      };
    }
    if (path === '/stats/abcdef1234567890') return {files: []};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'main',
      filePath: '',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('eval/hard.jsonl'));

  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/refs/heads/main');
  expect(wrapper.text()).toContain('Viewer abcdef1234567890 / eval/hard.jsonl');
  expect(wrapper.findComponent(viewerStub).props('commitHash')).toBe('abcdef1234567890');
  expect(wrapper.findComponent(viewerStub).props('filePath')).toBe('eval/hard.jsonl');
});

test('shows a useful message when a branch-only preview has no manifest files', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/refs/heads/empty') return {target_hash: 'abcdef1234567890'};
    if (path === '/tree/abcdef1234567890') return {entries: []};
    if (path === '/stats/abcdef1234567890') return {files: []};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'empty',
      filePath: '',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('No JSONL manifest files are available'));

  expect(wrapper.findComponent(viewerStub).exists()).toBe(false);
});

test('renders preview tree rows with folder chevrons, file icons, and active file state', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/tree/abcdef1234567890') {
      return {
        entries: [
          {name: 'eval/tool/weather.jsonl', obj_type: 'manifest'},
          {name: 'eval/safety.jsonl', obj_type: 'manifest'},
        ],
      };
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'abcdef1234567890',
      filePath: 'eval/tool/weather.jsonl',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });
  await vi.waitFor(() => expect(wrapper.findAll('.datahub-tree-folder').length).toBeGreaterThanOrEqual(1));

  const folderRows = wrapper.findAll('.datahub-tree-folder');
  const activeFile = wrapper.find('.datahub-tree-row.active');
  expect(folderRows.length).toBeGreaterThanOrEqual(1);
  expect(folderRows[0].find('.datahub-tree-chevron').exists()).toBe(true);
  expect(folderRows[0].find('.datahub-tree-folder-icon').exists()).toBe(true);
  expect(activeFile.text()).toContain('weather.jsonl');
  expect(activeFile.find('.datahub-tree-file-spacer').exists()).toBe(true);
  expect(activeFile.find('.datahub-tree-file-icon').exists()).toBe(true);
});

test('orders preview tree rows like the Data browser with folders first and locale names', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/tree/abcdef1234567890') {
      return {
        entries: [
          {name: 'zeta.jsonl', obj_type: 'manifest'},
          {name: '10.jsonl', obj_type: 'manifest'},
          {name: '_meta.jsonl', obj_type: 'manifest'},
          {name: 'beta', obj_type: 'tree'},
          {name: 'Alpha', obj_type: 'tree'},
        ],
      };
    }
    if (path === '/stats/abcdef1234567890') return {files: []};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'abcdef1234567890',
      filePath: '10.jsonl',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('zeta.jsonl'));

  expect(wrapper.findAll('.datahub-tree-row').map((row) => row.text())).toEqual([
    'Alpha',
    'beta',
    '_meta.jsonl',
    '10.jsonl',
    'zeta.jsonl',
  ]);
});

test('restores manually expanded preview folders after navigation remounts the page', async () => {
  window.sessionStorage.setItem(
    'datahub-preview-tree:alice/dataset:abcdef1234567890',
    JSON.stringify({open: ['eval/', 'stress/'], closed: []}),
  );
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/tree/abcdef1234567890') {
      return {
        entries: [
          {name: 'eval', obj_type: 'tree'},
          {name: 'stress', obj_type: 'tree'},
          {name: 'train', obj_type: 'tree'},
        ],
      };
    }
    if (path === '/tree/abcdef1234567890/eval') {
      return {entries: [{name: 'safety.jsonl', obj_type: 'manifest'}]};
    }
    if (path === '/tree/abcdef1234567890/stress') {
      return {entries: [{name: 'chunk_000.jsonl', obj_type: 'manifest'}]};
    }
    if (path === '/tree/abcdef1234567890/train') {
      return {entries: [{name: 'general.jsonl', obj_type: 'manifest'}]};
    }
    if (path === '/stats/abcdef1234567890') return {files: []};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'abcdef1234567890',
      filePath: 'train/general.jsonl',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('safety.jsonl'));
  expect(wrapper.text()).toContain('chunk_000.jsonl');
  expect(wrapper.text()).toContain('general.jsonl');
  expect(wrapper.vm.isFolderOpen('eval/')).toBe(true);
  expect(wrapper.vm.isFolderOpen('stress/')).toBe(true);
  expect(wrapper.vm.isFolderOpen('train/')).toBe(true);
});

test('keeps manually collapsed preview folders collapsed across navigation remounts', async () => {
  window.sessionStorage.setItem(
    'datahub-preview-tree:alice/dataset:abcdef1234567890',
    JSON.stringify({open: ['stress/'], closed: ['eval/']}),
  );
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/tree/abcdef1234567890') {
      return {
        entries: [
          {name: 'eval', obj_type: 'tree'},
          {name: 'stress', obj_type: 'tree'},
        ],
      };
    }
    if (path === '/tree/abcdef1234567890/stress') {
      return {entries: [{name: 'chunk_000.jsonl', obj_type: 'manifest'}]};
    }
    if (path === '/stats/abcdef1234567890') return {files: []};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'abcdef1234567890',
      filePath: 'stress/chunk_000.jsonl',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('chunk_000.jsonl'));
  expect(wrapper.vm.isFolderOpen('eval/')).toBe(false);
  expect(wrapper.vm.isFolderOpen('stress/')).toBe(true);
  expect(wrapper.text()).not.toContain('safety.jsonl');
});

test('builds the preview tree from stats when the root tree only exposes folders', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/tree/abcdef1234567890') {
      return {
        entries: [
          {name: 'eval', obj_type: 'tree'},
          {name: 'train', obj_type: 'tree'},
        ],
      };
    }
    if (path === '/stats/abcdef1234567890') {
      return {
        files: [
          {path: 'eval/tool/weather.jsonl', row_count: 1},
          {path: 'eval/safety.jsonl', row_count: 1},
          {path: 'train/general.jsonl', row_count: 2},
        ],
        totals: {file_count: 3, row_count: 4},
      };
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'abcdef1234567890',
      filePath: 'eval/tool/weather.jsonl',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('safety.jsonl'));

  expect(wrapper.text()).toContain('weather.jsonl');
  expect(wrapper.text()).toContain('safety.jsonl');
  expect(wrapper.find('a[href="/alice/dataset/data/preview/abcdef1234567890/eval/tool/weather.jsonl"]').exists()).toBe(true);
  expect(wrapper.findComponent(viewerStub).props('filePath')).toBe('eval/tool/weather.jsonl');
});

test('collapses and restores the preview files sidebar', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/tree/abcdef1234567890') {
      return {
        entries: [
          {name: 'eval/safety.jsonl', obj_type: 'manifest'},
          {name: 'train/general.jsonl', obj_type: 'manifest'},
        ],
      };
    }
    if (path === '/stats/abcdef1234567890') return {files: []};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'abcdef1234567890',
      filePath: 'eval/safety.jsonl',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('Files'));
  expect(wrapper.find('.datahub-preview-tree').exists()).toBe(true);
  expect(wrapper.find('.datahub-header-actions [data-testid="datahub-preview-sidebar-toggle"]').exists()).toBe(false);

  const hideButton = wrapper.find('.datahub-preview-tree button[data-testid="datahub-preview-sidebar-toggle"]');
  expect(hideButton.attributes('aria-label')).toBe('Hide files sidebar');
  await hideButton.trigger('click');

  expect(wrapper.find('.datahub-preview-workspace').classes()).toContain('is-sidebar-collapsed');
  expect(wrapper.find('.datahub-preview-tree').exists()).toBe(false);
  expect(wrapper.find('.datahub-preview-tree-rail').exists()).toBe(true);
  expect(wrapper.find('.datahub-preview-tree-rail button[data-testid="datahub-preview-sidebar-toggle"]').attributes('aria-label')).toBe('Show files sidebar');

  await wrapper.find('.datahub-preview-tree-rail button[data-testid="datahub-preview-sidebar-toggle"]').trigger('click');
  expect(wrapper.find('.datahub-preview-workspace').classes()).not.toContain('is-sidebar-collapsed');
  expect(wrapper.find('.datahub-preview-tree').exists()).toBe(true);
  expect(wrapper.find('.datahub-preview-tree-rail').exists()).toBe(false);
});

test('warns near the export action when preview rows have open linked issues', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/tree/abcdef1234567890') return {entries: [{name: 'eval/safety.jsonl', obj_type: 'manifest'}]};
    if (path === '/stats/abcdef1234567890') return {files: []};
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPreviewPage, {
    props: {
      owner: 'alice',
      repo: 'dataset',
      commitHash: 'abcdef1234567890',
      filePath: 'eval/safety.jsonl',
    },
    global: {stubs: {JsonlViewer: viewerStub}},
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('Viewer abcdef1234567890'));

  await wrapper.find('[data-testid="emit-open-issues"]').trigger('click');

  expect(wrapper.text()).toContain('2 open data issues before export');
  expect(wrapper.find('a[href="/alice/dataset/issues?q=datahub-row-context"]').exists()).toBe(true);
});
