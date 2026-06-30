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

test('datahubFetch surfaces safe API error summaries without leaking raw bodies', async () => {
  vi.spyOn(window, 'fetch').mockResolvedValue(new Response('{"message":"object not found","detail":"raw core traceback"}', {
    status: 404,
    statusText: 'Not Found',
    headers: {'Content-Type': 'application/json'},
  }));

  await expect(datahubFetch('alice', 'dataset', '/tree/badcommit')).rejects.toThrow('DataHub request failed with 404 Not Found: object not found.');
  await expect(datahubFetch('alice', 'dataset', '/tree/badcommit')).rejects.not.toThrow('raw core traceback');
});

test('datahubFetch surfaces JSON detail when message is unavailable', async () => {
  vi.spyOn(window, 'fetch').mockResolvedValue(new Response(`{"detail":"Ref 'heads/bad' not found"}`, {
    status: 404,
    statusText: 'Not Found',
    headers: {'Content-Type': 'application/json'},
  }));

  await expect(datahubFetch('alice', 'dataset', '/tree/bad')).rejects.toThrow("DataHub request failed with 404 Not Found: Ref 'heads/bad' not found.");
});

test('datahubFetch summarizes FastAPI validation details', async () => {
  vi.spyOn(window, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    detail: [{loc: ['body', 'author'], msg: 'Field required'}],
  }), {
    status: 422,
    statusText: 'Unprocessable Entity',
    headers: {'Content-Type': 'application/json'},
  }));

  await expect(datahubFetch('alice', 'dataset', '/pulls')).rejects.toThrow('DataHub request failed with 422 Unprocessable Entity: author: Field required.');
});

test('datahubFetch rejects HTML pages returned from API routes', async () => {
  vi.spyOn(window, 'fetch').mockResolvedValue(new Response('<html>login</html>', {
    status: 200,
    headers: {'Content-Type': 'text/html'},
  }));

  await expect(datahubFetch('alice', 'dataset', '/pulls/7/comments')).rejects.toThrow('DataHub returned a page instead of API data. Reload and try again.');
});
