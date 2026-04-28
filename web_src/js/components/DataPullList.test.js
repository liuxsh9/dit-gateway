import {mount} from '@vue/test-utils';
import {expect, test, vi} from 'vitest';

vi.mock('../utils/datahub-api.js', () => ({
  datahubFetch: vi.fn(),
}));

import DataPullList from './DataPullList.vue';
import {datahubFetch} from '../utils/datahub-api.js';

test('loads open dit pull requests by default and renders github-like cards', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/pulls?status=open') {
      return {
        pulls: [
          {
            pull_request_id: 7,
            title: 'Refresh safety SFT split',
            author: 'carol',
            status: 'open',
            source_ref: 'heads/safety-refresh',
            target_ref: 'heads/main',
            is_mergeable: true,
            stats_added: 12,
            stats_removed: 3,
            stats_refreshed: 4,
          },
          {
            id: 8,
            title: 'Archive stale eval rows',
            author: 'dave',
            status: 'open',
            source_branch: 'cleanup/evals',
            target_branch: 'main',
            is_mergeable: false,
            stats_added: 1,
            stats_removed: 9,
            stats_refreshed: 0,
          },
        ],
      };
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPullList, {
    props: {owner: 'alice', repo: 'dataset'},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('Refresh safety SFT split'));

  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls?status=open');
  expect(wrapper.text()).toContain('DIT pull requests');
  expect(wrapper.text()).toContain('Open');
  expect(wrapper.text()).toContain('Closed');
  expect(wrapper.text()).toContain('Merged');
  expect(wrapper.text()).toContain('carol');
  expect(wrapper.text()).toContain('safety-refresh → main');
  expect(wrapper.text()).toContain('+12');
  expect(wrapper.text()).toContain('-3');
  expect(wrapper.text()).toContain('~4');
  expect(wrapper.text()).toContain('Mergeable');
  expect(wrapper.text()).toContain('Needs resolution');
  expect(wrapper.find('a[href="/alice/dataset/data/pulls/7"]').exists()).toBe(true);
  expect(wrapper.find('a[href="/alice/dataset/data/pulls/8"]').exists()).toBe(true);
});

test('shows pull requests returned for the selected status', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/pulls?status=open') {
      return [{id: 1, title: 'Open review', status: 'open', source_ref: 'heads/a', target_ref: 'heads/main'}];
    }
    if (path === '/pulls?status=merged') {
      return [{id: 2, title: 'Merged review', status: 'merged', source_ref: 'heads/b', target_ref: 'heads/main'}];
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPullList, {
    props: {owner: 'alice', repo: 'dataset'},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('Open review'));
  expect(wrapper.text()).not.toContain('Merged review');

  await wrapper.findAll('button').find((button) => button.text().includes('Merged')).trigger('click');

  expect(wrapper.text()).toContain('Merged review');
  expect(wrapper.text()).not.toContain('Open review');
});

test('reloads pull requests when switching status filters', async () => {
  datahubFetch.mockImplementation(async (owner, repo, path) => {
    if (path === '/pulls?status=open') {
      return [{id: 1, title: 'Open review', status: 'open', source_ref: 'heads/a', target_ref: 'heads/main'}];
    }
    if (path === '/pulls?status=closed') {
      return [{id: 2, title: 'Closed review', status: 'closed', source_ref: 'heads/b', target_ref: 'heads/main'}];
    }
    if (path === '/pulls?status=merged') {
      return [{id: 3, title: 'Merged review', status: 'merged', source_ref: 'heads/c', target_ref: 'heads/main'}];
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPullList, {
    props: {owner: 'alice', repo: 'dataset'},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('Open review'));

  await wrapper.findAll('button').find((button) => button.text().includes('Closed')).trigger('click');
  await vi.waitFor(() => expect(wrapper.text()).toContain('Closed review'));
  expect(wrapper.text()).not.toContain('Open review');

  await wrapper.findAll('button').find((button) => button.text().includes('Merged')).trigger('click');
  await vi.waitFor(() => expect(wrapper.text()).toContain('Merged review'));
  expect(wrapper.text()).not.toContain('Closed review');
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls?status=closed');
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls?status=merged');
});
