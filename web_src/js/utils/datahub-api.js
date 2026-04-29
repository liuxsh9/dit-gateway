export async function datahubFetch(owner, repo, path, options = {}) {
  const url = `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/datahub${path}`;
  const resp = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Csrf-Token': document.querySelector('meta[name=_csrf]')?.content || '',
    },
    ...options,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Datahub API ${resp.status}: ${text}`);
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

export async function datahubFetchRaw(owner, repo, path, options = {}) {
  const url = `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/datahub${path}`;
  const resp = await fetch(url, {
    headers: {
      'X-Csrf-Token': document.querySelector('meta[name=_csrf]')?.content || '',
    },
    ...options,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Datahub API ${resp.status}: ${text}`);
  }
  return resp;
}
