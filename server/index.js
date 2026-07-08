import express from 'express';
import crypto from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const configPath = path.join(rootDir, 'status.config.json');
const distDir = path.join(rootDir, 'dist');
const port = process.env.PORT || 3001;
const serviceStatuses = new Set(['operational', 'degraded', 'maintenance', 'outage']);
const adminPassword = process.env.STATUS_ADMIN_PASSWORD || 'admin';

const app = express();

app.use(express.json({ limit: '100kb' }));

async function readStatusConfig() {
  const file = await readFile(configPath, 'utf8');
  const config = JSON.parse(file);

  return {
    ...config,
    generatedAt: new Date().toISOString()
  };
}

function assertString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
}

function passwordsMatch(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const expected = Buffer.from(adminPassword);
  const actual = Buffer.from(value);

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function requireAdminPassword(request, response, next) {
  if (!passwordsMatch(request.get('x-admin-password'))) {
    response.status(401).json({
      error: 'Invalid admin password'
    });
    return;
  }

  next();
}

function validateStatusConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Configuration must be an object');
  }

  if (!config.page || typeof config.page !== 'object') {
    throw new Error('Page details are required');
  }

  assertString(config.page.title, 'Page title');
  assertString(config.page.description, 'Page description');
  assertString(config.page.supportEmail, 'Support email');

  for (const listName of ['services', 'incidents', 'maintenance']) {
    if (!Array.isArray(config[listName])) {
      throw new Error(`${listName} must be an array`);
    }
  }

  for (const service of config.services) {
    assertString(service.name, 'Service name');
    assertString(service.description, 'Service description');
    assertString(service.status, 'Service status');

    if (!serviceStatuses.has(service.status)) {
      throw new Error(`Unsupported service status: ${service.status}`);
    }
  }

  for (const incident of config.incidents) {
    assertString(incident.title, 'Incident title');
    assertString(incident.status, 'Incident status');
    assertString(incident.impact, 'Incident impact');
    assertString(incident.updatedAt, 'Incident updated time');
    assertString(incident.message, 'Incident message');
  }

  for (const item of config.maintenance) {
    assertString(item.title, 'Maintenance title');
    assertString(item.scheduledFor, 'Maintenance start time');
    assertString(item.duration, 'Maintenance duration');
    assertString(item.message, 'Maintenance message');
  }
}

async function writeStatusConfig(config) {
  validateStatusConfig(config);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return readStatusConfig();
}

app.get('/api/status', async (_request, response) => {
  try {
    response.json(await readStatusConfig());
  } catch (error) {
    response.status(500).json({
      error: 'Unable to read status configuration',
      detail: error.message
    });
  }
});

app.post('/api/admin/login', (request, response) => {
  if (!passwordsMatch(request.body?.password)) {
    response.status(401).json({
      error: 'Invalid admin password'
    });
    return;
  }

  response.json({
    ok: true
  });
});

app.put('/api/status', requireAdminPassword, async (request, response) => {
  try {
    response.json(await writeStatusConfig(request.body));
  } catch (error) {
    response.status(400).json({
      error: error.message
    });
  }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distDir));
  app.get('*', (_request, response) => {
    response.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Status API running at http://localhost:${port}`);
});
