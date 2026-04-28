import {mount} from '@vue/test-utils';
import {expect, test, vi} from 'vitest';
import DataPullList from './DataPullList.vue';
import {datahubFetch} from '../utils/datahub-api.js';

vi.mock('../utils/datahub-api.js', () => ({
  datahubFetch: vi.fn(),
}));

test('loads dit pull request counts and renders a github-like inbox', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/pulls?status=open') {
      return {
        pulls: [
          {
            pull_request_id: 7,
            title: 'Refresh safety SFT split',
            author: 'carol',
            labels: ['quality'],
            assignees: ['erin'],
            status: 'open',
            source_ref: 'heads/safety-refresh',
            target_ref: 'heads/main',
            is_mergeable: true,
            stats_added: 12,
            stats_removed: 3,
            stats_refreshed: 4,
            comments_count: 2,
            updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: 8,
            title: 'Archive stale eval rows',
            author: 'dave',
            labels: ['cleanup'],
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
    if (path === '/pulls?status=closed') {
      return [{id: 9, title: 'Closed review', status: 'closed'}];
    }
    if (path === '/pulls?status=merged') {
      return [{id: 10, title: 'Merged review', status: 'merged'}];
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPullList, {
    props: {owner: 'alice', repo: 'dataset'},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('Refresh safety SFT split'));

  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls?status=open');
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls?status=closed');
  expect(datahubFetch).toHaveBeenCalledWith('alice', 'dataset', '/pulls?status=merged');
  expect(wrapper.find('input[aria-label="Search pull requests"]').element.value).toBe('is:pr is:open');
  expect(wrapper.text()).toContain('Filters');
  expect(wrapper.text()).toContain('Labels');
  expect(wrapper.text()).toContain('Milestones');
  expect(wrapper.text()).toContain('New pull request');
  expect(wrapper.text()).toContain('2 Open');
  expect(wrapper.text()).toContain('1 Closed');
  expect(wrapper.text()).toContain('1 Merged');
  expect(wrapper.text()).toContain('Author');
  expect(wrapper.text()).toContain('Label');
  expect(wrapper.text()).toContain('Reviews');
  expect(wrapper.text()).toContain('Assignee');
  expect(wrapper.text()).toContain('carol');
  expect(wrapper.text()).toContain('safety-refresh -> main');
  expect(wrapper.text()).toContain('+12');
  expect(wrapper.text()).toContain('-3');
  expect(wrapper.text()).toContain('~4');
  expect(wrapper.text()).toContain('Review required');
  expect(wrapper.text()).toContain('Needs resolution');
  expect(wrapper.text()).toContain('2');
  expect(wrapper.find('a[href="/alice/dataset/data/pulls/7"]').exists()).toBe(true);
  expect(wrapper.find('a[href="/alice/dataset/data/pulls/8"]').exists()).toBe(true);
});

test('filters pull requests from dropdown controls and search qualifiers', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/pulls?status=open') {
      return [
        {
          id: 1,
          title: 'Refresh safety rows',
          status: 'open',
          author: 'carol',
          labels: ['quality'],
          assignees: ['erin'],
          updated_at: '2026-04-20T00:00:00Z',
        },
        {
          id: 2,
          title: 'Clean eval split',
          status: 'open',
          author: 'dave',
          labels: ['cleanup'],
          assignees: ['frank'],
          updated_at: '2026-04-21T00:00:00Z',
        },
      ];
    }
    if (path === '/pulls?status=closed') return [];
    if (path === '/pulls?status=merged') return [];
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPullList, {
    props: {owner: 'alice', repo: 'dataset'},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('Refresh safety rows'));
  await wrapper.findAll('button').find((button) => button.text().includes('Author')).trigger('click');
  await wrapper.findAll('button').find((button) => button.text() === 'dave').trigger('click');

  expect(wrapper.find('input[aria-label="Search pull requests"]').element.value).toContain('author:dave');
  expect(wrapper.text()).toContain('Clean eval split');
  expect(wrapper.text()).not.toContain('Refresh safety rows');

  await wrapper.find('input[aria-label="Search pull requests"]').setValue('is:pr is:open label:quality');

  expect(wrapper.text()).toContain('Refresh safety rows');
  expect(wrapper.text()).not.toContain('Clean eval split');
});

test('switches pull request statuses without refetching', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/pulls?status=open') {
      return [{id: 1, title: 'Open review', status: 'open', source_ref: 'heads/a', target_ref: 'heads/main'}];
    }
    if (path === '/pulls?status=closed') {
      return [{id: 3, title: 'Closed review', status: 'closed', source_ref: 'heads/c', target_ref: 'heads/main'}];
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
  expect(datahubFetch).toHaveBeenCalledTimes(3);

  await wrapper.findAll('button').find((button) => button.text().includes('Merged')).trigger('click');

  expect(wrapper.text()).toContain('Merged review');
  expect(wrapper.text()).not.toContain('Open review');
  expect(wrapper.find('input[aria-label="Search pull requests"]').element.value).toBe('is:pr is:merged');
  expect(datahubFetch).toHaveBeenCalledTimes(3);
});

test('filters pull requests by search text after qualifiers', async () => {
  datahubFetch.mockImplementation(async (_owner, _repo, path) => {
    if (path === '/pulls?status=open') {
      return [
        {id: 1, title: 'Refresh safety rows', status: 'open', author: 'carol', source_ref: 'heads/safety', target_ref: 'heads/main'},
        {id: 2, title: 'Clean eval split', status: 'open', author: 'dave', source_ref: 'heads/eval', target_ref: 'heads/main'},
      ];
    }
    if (path === '/pulls?status=closed') {
      return [];
    }
    if (path === '/pulls?status=merged') {
      return [];
    }
    throw new Error(`unexpected path ${path}`);
  });

  const wrapper = mount(DataPullList, {
    props: {owner: 'alice', repo: 'dataset'},
  });

  await vi.waitFor(() => expect(wrapper.text()).toContain('Refresh safety rows'));
  expect(wrapper.text()).toContain('Clean eval split');

  await wrapper.find('input[aria-label="Search pull requests"]').setValue('is:pr is:open safety');

  expect(wrapper.text()).toContain('Refresh safety rows');
  expect(wrapper.text()).not.toContain('Clean eval split');
});
