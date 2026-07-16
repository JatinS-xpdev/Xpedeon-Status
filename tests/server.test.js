import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server/index.js';

function sampleConfig() {
  return {
    page: {
      title: 'Test Status',
      description: 'Test service status.',
      supportEmail: 'support@example.com'
    },
    services: [{
      id: 'service-web',
      name: 'Web',
      description: 'Web application',
      status: 'operational',
      history: {}
    }],
    incidents: [],
    maintenance: []
  };
}

async function withServer(options, callback) {
  const app = createApp(options);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('status API normalizes data and sends defensive response headers', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'xpedeon-status-'));
  const configFile = path.join(directory, 'status.config.json');
  await writeFile(configFile, JSON.stringify(sampleConfig()), 'utf8');

  try {
    await withServer({ configFile, staticDirectory: path.join(directory, 'missing'), adminPassword: 'secret' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/status`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
      assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.doesNotMatch(response.headers.get('content-security-policy'), /unsafe-inline/);

      const payload = await response.json();
      assert.equal(payload.services[0].id, 'service-web');
      assert.ok(payload.generatedAt);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('admin login and atomic status update require the configured password', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'xpedeon-status-'));
  const configFile = path.join(directory, 'status.config.json');
  await writeFile(configFile, JSON.stringify(sampleConfig()), 'utf8');

  try {
    await withServer({ configFile, staticDirectory: path.join(directory, 'missing'), adminPassword: 'secret' }, async (baseUrl) => {
      const failedLogin = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'wrong' })
      });
      assert.equal(failedLogin.status, 401);

      const successfulLogin = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'secret' })
      });
      assert.equal(successfulLogin.status, 200);

      const nextConfig = sampleConfig();
      nextConfig.incidents.push({
        id: 'incident-api',
        title: 'API slowdown',
        status: 'Investigating',
        impact: 'API requests',
        riskLevel: 'minor',
        startedAt: '2026-07-10T08:00:00.000Z',
        updatedAt: '2026-07-10T08:15:00.000Z',
        resolvedAt: '',
        affectsAllServices: true,
        affectedServiceIds: [],
        message: 'We are investigating slower responses.'
      });

      const updateResponse = await fetch(`${baseUrl}/api/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'secret', config: nextConfig })
      });
      assert.equal(updateResponse.status, 200);
      const updated = await updateResponse.json();
      assert.equal(updated.incidents.length, 1);

      const persisted = JSON.parse(await readFile(configFile, 'utf8'));
      assert.equal(persisted.incidents[0].id, 'incident-api');
      assert.equal(persisted.incidents[0].riskLevel, 'minor');
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('admin endpoints return a clear error when no password is configured', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'xpedeon-status-'));
  const configFile = path.join(directory, 'status.config.json');
  await writeFile(configFile, JSON.stringify(sampleConfig()), 'utf8');

  try {
    await withServer({ configFile, staticDirectory: path.join(directory, 'missing'), adminPassword: '' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'anything' })
      });
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /not configured/);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('status reads permanently remove reports older than the retention window', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'xpedeon-status-'));
  const configFile = path.join(directory, 'status.config.json');
  const config = sampleConfig();
  const oldEnd = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const oldStart = new Date(new Date(oldEnd).getTime() - 60 * 60 * 1000).toISOString();
  config.incidents.push({
    id: 'old-incident', title: 'Old issue', status: 'Resolved', impact: '', riskLevel: 'minor',
    startedAt: oldStart, updatedAt: oldEnd, resolvedAt: oldEnd, affectsAllServices: true,
    affectedServiceIds: [], message: 'This issue was resolved.'
  });
  config.maintenance.push({
    id: 'old-maintenance', title: 'Old work', scheduledFor: oldStart, endsAt: oldEnd,
    duration: '1 hour', affectsAllServices: true, affectedServiceIds: [], message: 'Old maintenance.'
  });
  await writeFile(configFile, JSON.stringify(config), 'utf8');

  try {
    await withServer({ configFile, staticDirectory: path.join(directory, 'missing'), adminPassword: 'secret' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/status`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.deepEqual(payload.incidents, []);
      assert.deepEqual(payload.maintenance, []);

      const persisted = JSON.parse(await readFile(configFile, 'utf8'));
      assert.deepEqual(persisted.incidents, []);
      assert.deepEqual(persisted.maintenance, []);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
