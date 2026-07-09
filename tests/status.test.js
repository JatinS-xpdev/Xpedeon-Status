import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatusSegments, createEmptyIncident, createEmptyService } from '../src/status.js';

test('buildStatusSegments spreads history across the chart', () => {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const twoDaysAgo = new Date(Date.now() - 172800000).toISOString().split('T')[0];

  const history = {
    [twoDaysAgo]: 'operational',
    [yesterday]: 'degraded',
    [today]: 'outage'
  };

  const segments = buildStatusSegments(history, 3);
  assert.deepEqual(segments, ['operational', 'degraded', 'outage']);
});

test('buildStatusSegments falls back to the current status when history is empty', () => {
  const segments = buildStatusSegments({}, 4, 'maintenance');
  assert.deepEqual(segments, [
    'maintenance',
    'maintenance',
    'maintenance',
    'maintenance'
  ]);
});

test('empty service seeds include history and issue severity defaults', () => {
  const service = createEmptyService();
  const incident = createEmptyIncident();

  assert.deepEqual(service.history, {});
  assert.equal(incident.riskLevel, 'minor');
});
