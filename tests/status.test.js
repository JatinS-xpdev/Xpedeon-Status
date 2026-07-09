import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatusSegments, createEmptyIncident, createEmptyService } from '../src/status.js';

test('buildStatusSegments spreads history across the chart', () => {
  assert.deepEqual(buildStatusSegments(['operational', 'degraded', 'outage'], 6), [
    'operational',
    'operational',
    'degraded',
    'degraded',
    'outage',
    'outage'
  ]);
});

test('buildStatusSegments falls back to the current status when history is empty', () => {
  assert.deepEqual(buildStatusSegments([], 4, 'maintenance'), [
    'maintenance',
    'maintenance',
    'maintenance',
    'maintenance'
  ]);
});

test('empty service seeds include history and issue severity defaults', () => {
  const service = createEmptyService();
  const incident = createEmptyIncident();

  assert.deepEqual(service.history, []);
  assert.equal(incident.riskLevel, 'minor');
});
