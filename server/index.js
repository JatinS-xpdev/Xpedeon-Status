import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { normalizeStatusConfig, validateStatusConfig } from '../src/status.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const configPath = process.env.STATUS_CONFIG_PATH
  ? path.resolve(process.env.STATUS_CONFIG_PATH)
  : path.join(rootDir, 'status.config.json');
const port = Number.parseInt(process.env.PORT || '3001', 10);
const configuredAdminPassword = process.env.STATUS_ADMIN_PASSWORD || 'admin';
const isProduction = process.env.NODE_ENV === 'production';

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getClientKey(request) {
  return request.ip || request.socket?.remoteAddress || 'unknown';
}

function createLoginRateLimiter({ windowMs = 5 * 60 * 1000, maxAttempts = 10 } = {}) {
  const attempts = new Map();

  return function loginRateLimiter(request, response, next) {
    const key = getClientKey(request);
    const now = Date.now();
    const record = attempts.get(key);

    if (!record || record.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    record.count += 1;
    if (record.count > maxAttempts) {
      response.status(429).json({ error: 'Too many login attempts. Please try again later.' });
      return;
    }

    next();
  };
}

function getErrorPayload(message, error) {
  const payload = { error: message };
  if (!isProduction && error?.message) {
    payload.detail = error.message;
  }
  return payload;
}

async function readStatusConfig(configFile) {
  const rawConfig = await readFile(configFile, 'utf8');
  const parsedConfig = JSON.parse(rawConfig);
  return {
    ...normalizeStatusConfig(parsedConfig),
    generatedAt: new Date().toISOString()
  };
}

async function writeStatusConfig(configFile, config) {
  const normalizedConfig = validateStatusConfig(config);
  const directory = path.dirname(configFile);
  const tempFile = path.join(directory, `.status.config.${process.pid}.${Date.now()}.tmp`);

  await mkdir(directory, { recursive: true });
  await writeFile(tempFile, `${JSON.stringify(normalizedConfig, null, 2)}\n`, 'utf8');
  await rename(tempFile, configFile);

  return {
    ...normalizedConfig,
    generatedAt: new Date().toISOString()
  };
}

function requireAdminPassword(adminPassword) {
  return function adminPasswordMiddleware(request, response, next) {
    const submittedPassword = request.body?.password;

    if (!adminPassword || !submittedPassword || !timingSafeEqual(submittedPassword, adminPassword)) {
      response.status(401).json({ error: 'Invalid administrator password.' });
      return;
    }

    next();
  };
}

export function createApp({
  configFile = configPath,
  staticDirectory = distDir,
  adminPassword = configuredAdminPassword
} = {}) {
  const app = express();
  const loginRateLimiter = createLoginRateLimiter();
  const verifyAdminPassword = requireAdminPassword(adminPassword);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true });
  });

  app.get('/api/status', async (_request, response) => {
    try {
      response.json(await readStatusConfig(configFile));
    } catch (error) {
      response.status(500).json(getErrorPayload('Unable to read status configuration.', error));
    }
  });

  app.post('/api/admin/login', loginRateLimiter, (request, response) => {
    if (!adminPassword || !request.body?.password || !timingSafeEqual(request.body.password, adminPassword)) {
      response.status(401).json({ error: 'Invalid administrator password.' });
      return;
    }

    response.json({ ok: true });
  });

  app.put('/api/status', verifyAdminPassword, async (request, response) => {
    try {
      const nextConfig = await writeStatusConfig(configFile, request.body?.config);
      response.json(nextConfig);
    } catch (error) {
      response.status(400).json(getErrorPayload('Unable to save status configuration.', error));
    }
  });

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API route not found.' });
  });

  const indexFile = path.join(staticDirectory, 'index.html');
  if (existsSync(indexFile)) {
    app.use(express.static(staticDirectory, {
      extensions: ['html'],
      maxAge: isProduction ? '1h' : 0
    }));
    app.get('*', (_request, response) => {
      response.sendFile(indexFile);
    });
  }

  return app;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  if (!process.env.STATUS_ADMIN_PASSWORD) {
    console.warn('STATUS_ADMIN_PASSWORD is not set. The default admin password is being used.');
  }

  createApp().listen(port, () => {
    console.log(`Xpedeon Status API listening on http://localhost:${port}`);
  });
}
