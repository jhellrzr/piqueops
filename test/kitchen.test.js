import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, createKitchen, validKitchen, activeIncident, deployBatch, triggerIncident, resolveIncident, rollbackBatch, refillJar, postmortem } from '../docs/kitchen.js';

const opened = '2026-01-01T12:00:00.000Z';
const closed = '2026-01-01T12:05:00.000Z';

test('a safe deployment consumes sauce, serves plates, and does not mutate its input', () => {
  const before = createKitchen(opened);
  const saved = structuredClone(before);
  const next = deployBatch(before, 24000, closed);
  assert.deepEqual(before, saved);
  assert.equal(next.current.id, 'batch-002');
  assert.equal(next.current.heat, 24000);
  assert.equal(next.fill, 74);
  assert.equal(next.plates, 17);
  assert.equal(next.activeIncident, null);
  assert.deepEqual(next.previous, before.current);
  assert.ok(validKitchen(next));
});

test('extreme heat opens an incident; resolution restores the exact last healthy batch', () => {
  const stable = deployBatch(createKitchen(opened), 24000, opened);
  const failed = deployBatch(stable, 96000, opened);
  assert.equal(activeIncident(failed).scenario, 'heat-budget');
  assert.throws(() => deployBatch(failed, 5800), /Resolve/);
  const fixed = resolveIncident(failed, closed);
  assert.equal(fixed.activeIncident, null);
  assert.deepEqual(fixed.current, stable.current);
  assert.equal(fixed.deployments[0].status, 'rolled back');
  assert.equal(fixed.incidents[0].resolvedAt, closed);
  assert.ok(validKitchen(fixed));
  assert.deepEqual(resolveIncident(fixed, closed), fixed);
});

test('injected heat incidents restore load without marking a healthy deployment rolled back', () => {
  const initial = createKitchen(opened);
  const failure = triggerIncident(initial, 'heat-budget', opened);
  assert.equal(failure.current.heat, 96000);
  const recovered = resolveIncident(failure, closed);
  assert.deepEqual(recovered.current, initial.current);
  assert.equal(recovered.deployments[0].status, 'healthy');
});

test('rollback restores the previous batch even during an unrelated incident', () => {
  const base = createKitchen(opened);
  const deployed = deployBatch(base, 24000, opened);
  const incident = triggerIncident(deployed, 'cap-lock', opened);
  const restored = rollbackBatch(incident, closed);
  assert.deepEqual(restored.current, base.current);
  assert.equal(restored.activeIncident, null);
  assert.equal(restored.deployments[0].status, 'rolled back');
  assert.deepEqual(rollbackBatch(restored, closed), restored);
});

test('incidents have one active commander and preserve prior history', () => {
  let state = createKitchen(opened);
  for (const scenario of SCENARIOS) {
    state = triggerIncident(state, scenario.id, opened);
    assert.equal(state.incidents[0].scenario, scenario.id);
    assert.deepEqual(triggerIncident(state, 'label-drift', opened), state);
    state = resolveIncident(state, closed);
    assert.ok(validKitchen(state));
  }
  assert.equal(state.incidentSequence, SCENARIOS.length);
  assert.equal(state.incidents.length, SCENARIOS.length);
});

test('empty jars cannot deploy and a refill restores capacity', () => {
  let state = createKitchen(opened);
  for (let i = 0; i < 10; i++) state = deployBatch(state, 5800, opened);
  assert.equal(state.fill, 2);
  assert.throws(() => deployBatch(state, 5800), /Top it up/);
  state = deployBatch(refillJar(state, closed), 5800, closed);
  assert.equal(state.fill, 92);
});

test('long sessions keep bounded histories and unique batch and incident identifiers', () => {
  let state = createKitchen(opened);
  for (let i = 0; i < 40; i++) {
    state = deployBatch(refillJar(state, opened), 5800, opened);
    state = resolveIncident(triggerIncident(state, 'cap-lock', opened), closed);
  }
  assert.equal(state.sequence, 41);
  assert.equal(state.incidentSequence, 40);
  assert.equal(state.deployments.length, 12);
  assert.equal(state.incidents.length, 12);
  assert.equal(state.events.length, 30);
  assert.equal(new Set(state.incidents.map(i => i.id)).size, 12);
  assert.ok(validKitchen(state));
});

test('invalid heat and corrupt saved data are rejected', () => {
  const base = createKitchen(opened);
  for (const heat of [0, 999, 100001, 1.5, NaN, Infinity, '5800']) assert.throws(() => deployBatch(base, heat));
  for (const value of [null, {}, { ...base, schema: 99 }, { ...base, fill: -1 }, { ...base, current: null }, { ...base, activeIncident: 'missing' }, { ...base, events: [{}] }]) assert.equal(validKitchen(value), false);
  assert.throws(() => triggerIncident(base, 'not-a-scenario'), /Unknown/);
});

test('exported postmortems distinguish open proposals from actual resolutions', () => {
  const state = triggerIncident(createKitchen(opened), 'unbounded-pour', opened);
  const draft = postmortem(state.incidents[0]);
  assert.match(draft, /Open — draft postmortem/);
  assert.match(draft, /Proposed resolution/);
  const resolved = postmortem(resolveIncident(state, closed).incidents[0]);
  assert.match(resolved, /Status:\*\* Resolved/);
  assert.match(resolved, /Resolved:\*\* 2026-01-01T12:05:00.000Z/);
  assert.match(resolved, /rate limiter/);
  assert.match(resolved, /All telemetry is fictional/);
});
