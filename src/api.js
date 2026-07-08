export async function fetchStatus() {
  const response = await fetch('/api/status');

  if (!response.ok) {
    throw new Error('Status API request failed');
  }

  return response.json();
}

export async function loginAdmin(password) {
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? 'Unable to sign in');
  }

  return payload;
}

export async function saveStatus(config, password) {
  const response = await fetch('/api/status', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-password': password
    },
    body: JSON.stringify(config)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? 'Unable to save status configuration');
  }

  return payload;
}
