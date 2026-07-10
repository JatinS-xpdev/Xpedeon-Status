import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildStatusSegments,
  formatDateTime,
  getRecentDateKeys,
  getWorstServiceStatus,
  normalizeServiceStatus,
  normalizeStatusConfig,
  STATUS_META,
  summarizeServices,
  validateStatusConfig
} from '../src/status.js';

test('normalizes known statuses and falls back safely for unknown values', () => {
  assert.equal(normalizeServiceStatus(' DEGRADED '), 'degraded');
  assert.equal(normalizeServiceStatus('not-real', 'maintenance'), 'maintenance');
  assert.equal(normalizeServiceStatus(undefined), 'operational');
});

test('builds a deterministic 30-day history ending on the supplied date', () => {
  const keys = getRecentDateKeys(3, new Date('2026-07-09T12:00:00.000Z'));
  assert.deepEqual(keys, ['2026-07-07', '2026-07-08', '2026-07-09']);

  const segments = buildStatusSegments(
    {
      '2026-07-07': 'operational',
      '2026-07-08': { status: 'maintenance' },
      '2026-07-09': 'outage'
    },
    3,
    'degraded',
    new Date('2026-07-09T12:00:00.000Z')
  );

  assert.deepEqual(segments, ['operational', 'maintenance', 'outage']);
});

test('summarizes services without overwriting counts', () => {
  const summary = summarizeServices([
    { status: 'operational' },
    { status: 'degraded' },
    { status: 'degraded' },
    { status: 'maintenance' },
    { status: 'outage' }
  ]);

  assert.deepEqual(summary, {
    operational: 1,
    degraded: 2,
    maintenance: 1,
    outage: 1
  });
});

test('worst service status follows configured severity ranking', () => {
  const worst = getWorstServiceStatus([
    { status: 'operational' },
    { status: 'maintenance' },
    { status: 'degraded' }
  ]);

  assert.equal(worst, STATUS_META.maintenance);
});

test('formatDateTime is resilient to missing and invalid input', () => {
  assert.equal(formatDateTime(''), 'Not set');
  assert.equal(formatDateTime('not-a-date'), 'Not set');
});

test('validation rejects unsupported service statuses and risk levels', () => {
  const validBase = {
    page: {
      title: 'Xpedeon Status',
      description: 'Live status',
      supportEmail: 'support@example.com'
    },
    services: [
      { name: 'Web', description: 'Web app', status: 'operational', history: {} }
    ],
    incidents: [],
    maintenance: []
  };

  assert.throws(
    () => validateStatusConfig({ ...validBase, services: [{ ...validBase.services[0], status: 'unknown' }] }),
    /unsupported status/
  );

  assert.throws(
    () => validateStatusConfig({
      ...validBase,
      incidents: [
        {
          title: 'Issue',
          status: 'Investigating',
          impact: 'API',
          riskLevel: 'severe',
          updatedAt: '2026-07-09T10:00:00.000Z',
          message: 'Investigating.'
        }
      ]
    }),
    /unsupported risk level/
  );
});

test('default status.config.json is valid', async () => {
  const rawConfig = await readFile(new URL('../status.config.json', import.meta.url), 'utf8');
  const parsedConfig = JSON.parse(rawConfig);
  const normalized = validateStatusConfig(parsedConfig);
  assert.equal(normalized.page.title, 'Xpedeon Status');
  assert.ok(normalized.services.length > 0);
});

test('normalization removes generated fields and guarantees arrays', () => {
  const normalized = normalizeStatusConfig({ generatedAt: '2026-07-09T10:00:00.000Z' });
  assert.deepEqual(Object.keys(normalized), ['page', 'services', 'incidents', 'maintenance']);
  assert.deepEqual(normalized.services, []);
  assert.deepEqual(normalized.incidents, []);
  assert.deepEqual(normalized.maintenance, []);
});
