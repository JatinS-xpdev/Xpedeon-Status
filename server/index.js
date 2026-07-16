import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { pruneExpiredReports, validateStatusConfig } from '../src/status.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const configPath = process.env.STATUS_CONFIG_PATH
  ? path.resolve(process.env.STATUS_CONFIG_PATH)
  : path.join(rootDir, 'status.config.json');
const parsedPort = Number.parseInt(process.env.PORT || '3001', 10);
const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3001;
const isProduction = process.env.NODE_ENV === 'production';
const configuredAdminPassword = process.env.STATUS_ADMIN_PASSWORD || (isProduction ? '' : 'admin');

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

function createLoginAttemptTracker({ windowMs = 15 * 60 * 1000, maxFailures = 8 } = {}) {
  const failures = new Map();

  function getRecord(key, now = Date.now()) {
    const record = failures.get(key);
    if (!record || record.resetAt <= now) {
      failures.delete(key);
      return null;
    }
    return record;
  }

  return {
    getRetryAfterSeconds(key) {
      const record = getRecord(key);
      if (!record || record.count < maxFailures) {
        return 0;
      }
      return Math.max(1, Math.ceil((record.resetAt - Date.now()) / 1000));
    },
    recordFailure(key) {
      const now = Date.now();
      const record = getRecord(key, now) || { count: 0, resetAt: now + windowMs };
      record.count += 1;
      failures.set(key, record);
    },
    clear(key) {
      failures.delete(key);
    }
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
  const now = new Date();
  const normalizedConfig = validateStatusConfig(parsedConfig);
  const retainedConfig = pruneExpiredReports(normalizedConfig, now);
  const removedReportCount = normalizedConfig.incidents.length + normalizedConfig.maintenance.length
    - retainedConfig.incidents.length - retainedConfig.maintenance.length;

  if (removedReportCount > 0) {
    await persistStatusConfig(configFile, retainedConfig);
  }

  return {
    ...retainedConfig,
    generatedAt: now.toISOString()
  };
}

async function persistStatusConfig(configFile, normalizedConfig) {
  const directory = path.dirname(configFile);
  const tempFile = path.join(directory, `.status.config.${process.pid}.${crypto.randomUUID()}.tmp`);

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(tempFile, `${JSON.stringify(normalizedConfig, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
    await rename(tempFile, configFile);
  } catch (error) {
    await unlink(tempFile).catch(() => {});
    throw error;
  }

}

async function writeStatusConfig(configFile, config) {
  const now = new Date();
  const normalizedConfig = pruneExpiredReports(validateStatusConfig(config), now);
  await persistStatusConfig(configFile, normalizedConfig);
  return { ...normalizedConfig, generatedAt: now.toISOString() };
}

function setSecurityHeaders(_request, response, next) {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('X-DNS-Prefetch-Control', 'off');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'"
  );
  next();
}

function verifyAdminRequest(request, response, adminPassword, attemptTracker) {
  if (!adminPassword) {
    response.status(503).json({ error: 'Administrator access is not configured on this server.' });
    return false;
  }

  const key = getClientKey(request);
  const retryAfter = attemptTracker.getRetryAfterSeconds(key);
  if (retryAfter) {
    response.setHeader('Retry-After', String(retryAfter));
    response.status(429).json({ error: 'Too many failed login attempts. Please try again later.' });
    return false;
  }

  const submittedPassword = request.body?.password;
  if (!submittedPassword || !timingSafeEqual(submittedPassword, adminPassword)) {
    attemptTracker.recordFailure(key);
    response.status(401).json({ error: 'Invalid administrator password.' });
    return false;
  }

  attemptTracker.clear(key);
  return true;
}

export function createApp({
  configFile = configPath,
  staticDirectory = distDir,
  adminPassword = configuredAdminPassword
} = {}) {
  const app = express();
  const attemptTracker = createLoginAttemptTracker();
  let configOperation = Promise.resolve();

  function runConfigOperation(operation) {
    const result = configOperation.then(operation, operation);
    configOperation = result.then(() => undefined, () => undefined);
    return result;
  }

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }
  app.use(setSecurityHeaders);
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, configured: Boolean(adminPassword) });
  });

  app.get('/api/status', async (_request, response) => {
    try {
      response.json(await runConfigOperation(() => readStatusConfig(configFile)));
    } catch (error) {
      response.status(500).json(getErrorPayload('Unable to read status configuration.', error));
    }
  });

  app.post('/api/admin/login', (request, response) => {
    if (!verifyAdminRequest(request, response, adminPassword, attemptTracker)) {
      return;
    }
    response.json({ ok: true });
  });

  app.put('/api/status', async (request, response) => {
    if (!verifyAdminRequest(request, response, adminPassword, attemptTracker)) {
      return;
    }

    try {
      const nextConfig = await runConfigOperation(() => writeStatusConfig(configFile, request.body?.config));
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
      index: false,
      immutable: isProduction,
      maxAge: isProduction ? '1y' : 0
    }));
    app.get('*', (_request, response) => {
      response.setHeader('Cache-Control', 'no-cache');
      response.sendFile(indexFile);
    });
  }

  app.use((error, _request, response, next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      response.status(400).json({ error: 'Request body contains invalid JSON.' });
      return;
    }
    next(error);
  });

  return app;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  if (!configuredAdminPassword) {
    console.error('STATUS_ADMIN_PASSWORD must be set when NODE_ENV=production.');
    process.exit(1);
  }

  if (!process.env.STATUS_ADMIN_PASSWORD) {
    console.warn('STATUS_ADMIN_PASSWORD is not set. Development password “admin” is active.');
  }

  createApp().listen(port, () => {
    console.log(`Xpedeon Status listening on http://localhost:${port}`);
  });
}
