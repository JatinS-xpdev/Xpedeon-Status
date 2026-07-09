async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.detail || `Request failed with status ${response.status}`);
  }
  return payload;
}

export function fetchStatus(options = {}) {
  return requestJson('/api/status', { signal: options.signal });
}

export function loginAdmin(password, options = {}) {
  return requestJson('/api/admin/login', {
    method: 'POST',
    signal: options.signal,
    body: JSON.stringify({ password })
  });
}

export function saveStatus(config, password, options = {}) {
  return requestJson('/api/status', {
    method: 'PUT',
    signal: options.signal,
    body: JSON.stringify({ password, config })
  });
}
