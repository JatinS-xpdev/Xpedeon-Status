import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildServiceTimeline,
  buildStatusSegments,
  formatDateTime,
  getActiveIncidents,
  getAffectedServiceNames,
  getDateKey,
  getEffectiveServiceStatus,
  getIncidentDerivedStatus,
  getRecentDateKeys,
  getWorstServiceStatus,
  normalizeServiceStatus,
  normalizeStatusConfig,
  STATUS_META,
  summarizeServices,
  validateStatusConfig
} from '../src/status.js';

const page = {
  title: 'Xpedeon Status',
  description: 'Live status',
  supportEmail: 'support@example.com'
};

function baseConfig() {
  return {
    page,
    services: [
      {
        id: 'service-web',
        name: 'Web',
        description: 'Web application',
        status: 'operational',
        history: {}
      },
      {
        id: 'service-api',
        name: 'API',
        description: 'API traffic',
        status: 'operational',
        history: {}
      }
    ],
    incidents: [],
    maintenance: []
  };
}

test('normalizes known statuses and falls back safely for unknown values', () => {
  assert.equal(normalizeServiceStatus(' DEGRADED '), 'degraded');
  assert.equal(normalizeServiceStatus('not-real', 'maintenance'), 'maintenance');
  assert.equal(normalizeServiceStatus(undefined), 'operational');
});

test('maps incident risk levels to automatic service states', () => {
  assert.equal(getIncidentDerivedStatus('minor'), 'degraded');
  assert.equal(getIncidentDerivedStatus('major'), 'outage');
  assert.equal(getIncidentDerivedStatus('critical'), 'outage');
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

test('uses the viewer local calendar date rather than the UTC date', () => {
  const localShortlyAfterMidnight = new Date(2026, 6, 10, 0, 15);
  assert.equal(getDateKey(localShortlyAfterMidnight), '2026-07-10');
  assert.deepEqual(getRecentDateKeys(2, localShortlyAfterMidnight), ['2026-07-09', '2026-07-10']);
});

test('automatically overlays incidents and maintenance on affected service history', () => {
  const service = baseConfig().services[0];
  const incidents = [
    {
      id: 'incident-minor',
      title: 'Slow requests',
      status: 'Resolved',
      riskLevel: 'minor',
      startedAt: '2026-07-08T10:00:00.000Z',
      updatedAt: '2026-07-09T10:00:00.000Z',
      resolvedAt: '2026-07-09T10:00:00.000Z',
      affectsAllServices: false,
      affectedServiceIds: ['service-web'],
      message: 'Requests were slow.'
    },
    {
      id: 'incident-critical',
      title: 'Unavailable',
      status: 'Investigating',
      riskLevel: 'critical',
      startedAt: '2026-07-10T01:00:00.000Z',
      updatedAt: '2026-07-10T01:30:00.000Z',
      resolvedAt: '',
      affectsAllServices: false,
      affectedServiceIds: ['service-web'],
      message: 'Service unavailable.'
    }
  ];
  const maintenance = [
    {
      id: 'maintenance-1',
      title: 'Database work',
      scheduledFor: '2026-07-09T20:00:00.000Z',
      endsAt: '2026-07-10T02:00:00.000Z',
      duration: '6 hours',
      affectsAllServices: false,
      affectedServiceIds: ['service-web'],
      message: 'Planned work.'
    }
  ];

  const timeline = buildServiceTimeline(
    service,
    incidents,
    maintenance,
    3,
    new Date('2026-07-10T12:00:00.000Z')
  );

  assert.deepEqual(timeline.map((entry) => entry.status), ['degraded', 'maintenance', 'outage']);
  assert.equal(timeline[0].sources[0].kind, 'incident');
  assert.equal(timeline[1].isAutomatic, true);
  assert.equal(timeline[2].sources.some((source) => source.title === 'Unavailable'), true);
});

test('automatic history only applies to selected services', () => {
  const config = baseConfig();
  const incident = {
    id: 'incident-api',
    title: 'API issue',
    status: 'Investigating',
    riskLevel: 'major',
    startedAt: '2026-07-10T08:00:00.000Z',
    updatedAt: '2026-07-10T08:00:00.000Z',
    resolvedAt: '',
    affectsAllServices: false,
    affectedServiceIds: ['service-api'],
    message: 'API issue.'
  };
  const at = new Date('2026-07-10T12:00:00.000Z');

  assert.equal(getEffectiveServiceStatus(config.services[0], [incident], [], at), 'operational');
  assert.equal(getEffectiveServiceStatus(config.services[1], [incident], [], at), 'outage');
});

test('future maintenance appears in the date history but not the current service pill', () => {
  const service = baseConfig().services[0];
  const maintenance = [{
    id: 'maintenance-future',
    title: 'Evening maintenance',
    scheduledFor: '2026-07-10T18:00:00.000Z',
    endsAt: '2026-07-10T19:00:00.000Z',
    duration: '1 hour',
    affectsAllServices: true,
    affectedServiceIds: [],
    message: 'Planned.'
  }];
  const at = new Date('2026-07-10T12:00:00.000Z');

  assert.equal(getEffectiveServiceStatus(service, [], maintenance, at), 'operational');
  const timeline = buildServiceTimeline(service, [], maintenance, 1, at);
  assert.equal(timeline[0].status, 'maintenance');
});

test('an event ending exactly at local midnight does not mark the following day', () => {
  const service = baseConfig().services[0];
  const maintenance = [{
    id: 'maintenance-midnight',
    title: 'Late maintenance',
    scheduledFor: new Date(2026, 6, 8, 23, 0).toISOString(),
    endsAt: new Date(2026, 6, 9, 0, 0).toISOString(),
    duration: '1 hour',
    affectsAllServices: true,
    affectedServiceIds: [],
    message: 'Planned.'
  }];

  const timeline = buildServiceTimeline(service, [], maintenance, 2, new Date(2026, 6, 9, 12, 0));
  assert.deepEqual(timeline.map((entry) => entry.status), ['maintenance', 'operational']);
});

test('resolved incident reports leave active lists but remain in history', () => {
  const incident = {
    id: 'incident-resolved',
    title: 'Resolved issue',
    status: 'Resolved',
    riskLevel: 'minor',
    startedAt: '2026-07-08T08:00:00.000Z',
    updatedAt: '2026-07-08T10:00:00.000Z',
    resolvedAt: '2026-07-08T10:00:00.000Z',
    affectsAllServices: true,
    affectedServiceIds: [],
    message: 'Resolved.'
  };
  const at = new Date('2026-07-10T12:00:00.000Z');

  assert.deepEqual(getActiveIncidents([incident], at), []);
  const timeline = buildServiceTimeline(baseConfig().services[0], [incident], [], 3, at);
  assert.equal(timeline[0].status, 'degraded');
});

test('normalizes legacy reports with stable IDs, all-service scope and inferred times', () => {
  const normalized = normalizeStatusConfig({
    page,
    services: [{ name: 'Web App', description: 'Web', status: 'operational', history: {} }],
    incidents: [{
      title: 'Issue',
      status: 'Investigating',
      impact: 'Web',
      riskLevel: 'minor',
      updatedAt: '2026-07-09T10:00:00.000Z',
      message: 'Investigating.'
    }],
    maintenance: [{
      title: 'Work',
      scheduledFor: '2026-07-10T10:00:00.000Z',
      duration: '45 minutes',
      message: 'Maintenance.'
    }]
  });

  assert.equal(normalized.services[0].id, 'service-web-app');
  assert.equal(normalized.incidents[0].startedAt, normalized.incidents[0].updatedAt);
  assert.equal(normalized.incidents[0].affectsAllServices, true);
  assert.equal(normalized.maintenance[0].endsAt, '2026-07-10T10:45:00.000Z');
});

test('normalization infers a resolution time for legacy resolved reports', () => {
  const normalized = normalizeStatusConfig({
    ...baseConfig(),
    incidents: [{
      title: 'Recovered',
      status: 'Resolved',
      riskLevel: 'minor',
      startedAt: '2026-07-09T09:00:00.000Z',
      updatedAt: '2026-07-09T10:00:00.000Z',
      message: 'Recovered.',
      affectsAllServices: true,
      affectedServiceIds: []
    }]
  });

  assert.equal(normalized.incidents[0].resolvedAt, '2026-07-09T10:00:00.000Z');
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

test('affected service labels handle all, selected and empty scopes', () => {
  const services = baseConfig().services;
  assert.deepEqual(getAffectedServiceNames({ affectsAllServices: true }, services), ['All services']);
  assert.deepEqual(
    getAffectedServiceNames({ affectsAllServices: false, affectedServiceIds: ['service-api'] }, services),
    ['API']
  );
  assert.deepEqual(getAffectedServiceNames({ affectsAllServices: false, affectedServiceIds: [] }, services), ['No services selected']);
});

test('formatDateTime is resilient to missing and invalid input', () => {
  assert.equal(formatDateTime(''), 'Not set');
  assert.equal(formatDateTime('not-a-date'), 'Not set');
});

test('validation rejects unsupported statuses, risk levels and unknown service references', () => {
  const valid = baseConfig();

  assert.throws(
    () => validateStatusConfig({ ...valid, services: [{ ...valid.services[0], status: 'unknown' }] }),
    /unsupported status/
  );

  assert.throws(
    () => validateStatusConfig({
      ...valid,
      incidents: [{
        id: 'incident-1',
        title: 'Issue',
        status: 'Investigating',
        impact: 'API',
        riskLevel: 'severe',
        startedAt: '2026-07-09T09:00:00.000Z',
        updatedAt: '2026-07-09T10:00:00.000Z',
        resolvedAt: '',
        affectsAllServices: true,
        affectedServiceIds: [],
        message: 'Investigating.'
      }]
    }),
    /unsupported risk level/
  );

  assert.throws(
    () => validateStatusConfig({
      ...valid,
      incidents: [{
        id: 'incident-1',
        title: 'Issue',
        status: 'Investigating',
        impact: 'API',
        riskLevel: 'minor',
        startedAt: '2026-07-09T09:00:00.000Z',
        updatedAt: '2026-07-09T10:00:00.000Z',
        resolvedAt: '',
        affectsAllServices: false,
        affectedServiceIds: ['missing-service'],
        message: 'Investigating.'
      }]
    }),
    /unknown service/
  );

  assert.throws(
    () => validateStatusConfig({
      ...valid,
      incidents: [{
        id: 'incident-empty-scope',
        title: 'Issue',
        status: 'Investigating',
        impact: '',
        riskLevel: 'minor',
        startedAt: '2026-07-09T09:00:00.000Z',
        updatedAt: '2026-07-09T10:00:00.000Z',
        resolvedAt: '',
        affectsAllServices: false,
        affectedServiceIds: [],
        message: 'Investigating.'
      }]
    }),
    /at least one service/
  );

  assert.throws(
    () => validateStatusConfig({
      ...valid,
      incidents: [{
        id: 'incident-bad-time',
        title: 'Issue',
        status: 'Investigating',
        impact: '',
        riskLevel: 'minor',
        startedAt: '2026-07-09T10:00:00.000Z',
        updatedAt: '2026-07-09T09:00:00.000Z',
        resolvedAt: '',
        affectsAllServices: true,
        affectedServiceIds: [],
        message: 'Investigating.'
      }]
    }),
    /updated time cannot be before/
  );

  assert.throws(
    () => validateStatusConfig({
      ...valid,
      services: [{ ...valid.services[0], history: { '2026-02-31': 'operational' } }]
    }),
    /invalid date/
  );
});

test('default status.config.json is valid and migrates to the new report schema', async () => {
  const rawConfig = await readFile(new URL('../status.config.json', import.meta.url), 'utf8');
  const parsedConfig = JSON.parse(rawConfig);
  const normalized = validateStatusConfig(parsedConfig);
  assert.equal(normalized.page.title, 'Xpedeon Status');
  assert.ok(normalized.services.length > 0);
  assert.ok(normalized.services.every((service) => service.id));
  assert.ok(normalized.incidents.every((incident) => incident.startedAt));
  assert.ok(normalized.maintenance.every((item) => item.endsAt));
});

test('normalization removes generated fields and guarantees arrays', () => {
  const normalized = normalizeStatusConfig({ generatedAt: '2026-07-09T10:00:00.000Z' });
  assert.deepEqual(Object.keys(normalized), ['page', 'services', 'incidents', 'maintenance']);
  assert.deepEqual(normalized.services, []);
  assert.deepEqual(normalized.incidents, []);
  assert.deepEqual(normalized.maintenance, []);
});
