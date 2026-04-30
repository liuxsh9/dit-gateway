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

test('datahubFetch hides raw API error bodies from UI errors', async () => {
  vi.spyOn(window, 'fetch').mockResolvedValue(new Response('{"message":"object not found","detail":"raw core traceback"}', {
    status: 404,
    statusText: 'Not Found',
    headers: {'Content-Type': 'application/json'},
  }));

  await expect(datahubFetch('alice', 'dataset', '/tree/badcommit')).rejects.toThrow('DataHub request failed with 404 Not Found.');
  await expect(datahubFetch('alice', 'dataset', '/tree/badcommit')).rejects.not.toThrow('raw core traceback');
});
