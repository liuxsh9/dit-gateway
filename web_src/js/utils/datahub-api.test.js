import {afterEach, expect, test, vi} from 'vitest';

import {datahubFetch} from './datahub-api.js';

afterEach(() => {
  vi.restoreAllMocks();
});

test('datahubFetch parses JSON responses through text bodies', async () => {
  const fetchMock = vi.spyOn(window, 'fetch').mockResolvedValue(new Response('{"ok":true}', {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  }));

  await expect(datahubFetch('alice', 'dataset', '/refs')).resolves.toEqual({ok: true});
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/repos/alice/dataset/datahub/refs', expect.any(Object));
});

test('datahubFetch returns null for empty successful responses', async () => {
  vi.spyOn(window, 'fetch').mockResolvedValue(new Response('', {status: 204}));

  await expect(datahubFetch('alice', 'dataset', '/meta/compute')).resolves.toBeNull();
});
