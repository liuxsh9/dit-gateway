import {request} from '../modules/fetch.js';

export async function datahubFetch(owner, repo, path, options = {}) {
  const url = `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/datahub${path}`;
  const {headers = {}, ...requestOptions} = options;
  const resp = await request(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Csrf-Token': document.querySelector('meta[name=_csrf]')?.content || '',
      ...headers,
    },
    ...requestOptions,
  });
  if (!resp.ok) {
    throw await datahubResponseError(resp);
  }
  if (resp.redirected) {
    throw new Error('DataHub request was redirected before it completed. Reload and try again.');
  }
  if (datahubResponseIsHTML(resp)) {
    throw new Error('DataHub returned a page instead of API data. Reload and try again.');
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

export async function datahubFetchRaw(owner, repo, path, options = {}) {
  const url = `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/datahub${path}`;
  const {headers = {}, ...requestOptions} = options;
  const resp = await request(url, {
    headers: {
      'X-Csrf-Token': document.querySelector('meta[name=_csrf]')?.content || '',
      ...headers,
    },
    ...requestOptions,
  });
  if (!resp.ok) {
    throw await datahubResponseError(resp);
  }
  if (resp.redirected) {
    throw new Error('DataHub request was redirected before it completed. Reload and try again.');
  }
  return resp;
}

async function datahubResponseError(resp) {
  const statusText = resp.statusText ? ` ${resp.statusText}` : '';
  const summary = await datahubErrorSummary(resp);
  return new Error(`DataHub request failed with ${resp.status}${statusText}${summary ? `: ${summary}` : ''}.`);
}

async function datahubErrorSummary(resp) {
  const contentType = resp.headers?.get?.('Content-Type') || '';
  if (!contentType.includes('application/json')) return '';

  try {
    const body = await resp.clone().json();
    const summary = [body?.message, summarizeDetail(body?.detail), body?.error]
      .find((value) => typeof value === 'string' && value.trim());
    return sanitizeErrorSummary(summary);
  } catch {
    return '';
  }
}

function summarizeDetail(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (!item || typeof item !== 'object') return '';
        const location = Array.isArray(item.loc) ? item.loc.filter((part) => part !== 'body').join('.') : '';
        const message = typeof item.msg === 'string' ? item.msg : '';
        return [location, message].filter(Boolean).join(': ');
      })
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

function sanitizeErrorSummary(summary) {
  if (!summary) return '';
  return summary
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

function datahubResponseIsHTML(resp) {
  return (resp.headers?.get?.('Content-Type') || '').includes('text/html');
}
