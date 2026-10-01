import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/piqueops.js', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('all report commands produce parseable JSON without terminal decoration', () => {
  for (const command of ['status', 'deploy', 'incident', 'postmortem']) {
    const result = run(command, '--json');
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.command, command);
    assert.equal(report.simulation, true);
    assert.ok(report.title);
    assert.ok(report.kitchen.current);
    assert.equal(result.stderr, '');
  }
});

test('heat changes the simulated deployment outcome and is reported faithfully', () => {
  const hot = JSON.parse(run('deploy', '--heat', '75000', '--json').stdout);
  assert.equal(hot.kitchen.current.heat, 75000);
  assert.match(hot.title, /DEGRADED/);
  assert.equal(hot.kitchen.activeIncident, 'INC-001');
  const safe = JSON.parse(run('deploy', '--heat', '50000', '--json').stdout);
  assert.equal(safe.kitchen.activeIncident, null);
});

test('scenario choice and Markdown export work without guessing shell output', () => {
  const result = run('postmortem', '--scenario', 'label-drift', '--markdown');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^# INC-001: Configuration drift/);
  assert.match(result.stdout, /masking tape/);
});

test('bad commands and incompatible flags exit nonzero with actionable usage', () => {
  for (const args of [
    ['wat'], ['status', 'deploy'], ['--wat'], ['deploy', '--heat'],
    ['deploy', '--heat', 'NaN'], ['deploy', '--heat', '999999'],
    ['status', '--heat', '5800'], ['incident', '--scenario', 'unknown'],
    ['status', '--scenario', 'cap-lock'], ['status', '--markdown'],
    ['postmortem', '--json', '--markdown']
  ]) {
    const result = run(...args);
    assert.equal(result.status, 2, args.join(' '));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /--help/);
  }
});

test('help and version are available without running a simulation', () => {
  assert.match(run('--help').stdout, /Usage:/);
  assert.equal(run('--version').stdout.trim(), '0.2.0');
});

test('recipe and shopping commands offer real scaled quantities', () => {
  const recipe = run('recipe', '--scale', '2', '--json');
  assert.equal(recipe.status, 0, recipe.stderr);
  const parsed = JSON.parse(recipe.stdout);
  assert.equal(parsed.ingredients.find(i => i.id === 'arbol').amount, 80);
  assert.equal(parsed.steps.length, 4);
  assert.match(parsed.storage, /refrigerated/);
  const shopping = run('shopping', '--metric', '--scale', '0.5');
  assert.equal(shopping.status, 0, shopping.stderr);
  assert.match(shopping.stdout, /473 mL White vinegar/);
  assert.match(shopping.stdout, /1 per bottle Serrano/);
  assert.match(run('recipe').stdout, /For meat, rice, and beans/);
  for (const args of [['recipe', '--scale', '8'], ['shopping', '--heat', '5800'], ['status', '--metric'], ['deploy', '--scale', '2'], ['recipe', '--markdown']]) assert.equal(run(...args).status, 2);
});
