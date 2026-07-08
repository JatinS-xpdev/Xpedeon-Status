export async function fetchStatus() {
  const response = await fetch('/api/status');

  if (!response.ok) {
    throw new Error('Status API request failed');
  }

  return response.json();
}

export async function saveStatus(config) {
  const response = await fetch('/api/status', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(config)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? 'Unable to save status configuration');
  }

  return payload;
}
