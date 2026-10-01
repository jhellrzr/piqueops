import test from 'node:test';
import assert from 'node:assert/strict';
import { INGREDIENTS, scaledIngredients, shoppingList, soakReady, timerRemaining, makeBatch, validNotebook } from '../docs/recipe.js';

const byId = (items, id) => items.find(item => item.id === id);
const example = () => makeBatch({ name: 'Beans deserve this', scale: 1, soakHours: 24, peppers: 'Árbol', heat: 3, tang: 4, notes: 'Try a shorter soak next time.' }, 'batch-test', '2026-09-30T12:00:00.000Z');

test('scaling preserves the source and the per-bottle instruction', () => {
  const original = structuredClone(INGREDIENTS);
  const double = scaledIngredients(2);
  assert.equal(byId(double, 'white-vinegar').quantity, '8 cups');
  assert.equal(byId(double, 'arbol').amount, 80);
  assert.equal(byId(double, 'salt').quantity, '½ cup');
  assert.equal(byId(double, 'serrano').quantity, '1 per bottle');
  const half = scaledIngredients(0.5);
  assert.equal(byId(half, 'jalapenos').quantity, '2½');
  assert.equal(byId(half, 'pepper').quantity, '½ tsp');
  assert.equal(byId(half, 'rice-vinegar').quantity, '⅛ cup');
  assert.deepEqual(INGREDIENTS, original);
  for (const invalid of [0, -1, 4, NaN, Infinity, '2']) assert.throws(() => scaledIngredients(invalid));
});

test('metric mode converts liquids only, without guessing pepper or salt weights', () => {
  const metric = scaledIngredients(1, true);
  assert.equal(byId(metric, 'white-vinegar').quantity, '946 mL');
  assert.equal(byId(metric, 'rice-vinegar').quantity, '59 mL');
  assert.equal(byId(metric, 'cooking-water').quantity, '237 mL');
  assert.equal(byId(metric, 'salt').quantity, '¼ cup');
  assert.equal(byId(metric, 'arbol').quantity, '40');
});

test('shopping lists carry scaled quantities and source without selling cooking water', () => {
  const list = shoppingList(2);
  assert.match(list, /8 cups White vinegar/);
  assert.match(list, /1 per bottle Serrano/);
  assert.doesNotMatch(list, /☐.*Reserved cooking liquid/);
  assert.match(list, /husbandsthatcook.com/);
});

test('soak planner uses elapsed hours across a daylight-saving change', () => {
  assert.equal(soakReady('2026-11-01T00:00:00-07:00', 24), '2026-11-02T07:00:00.000Z');
  assert.throws(() => soakReady('tomorrow', 24));
  assert.throws(() => soakReady('2026-09-30', 5));
});

test('timer survives elapsed time, pause, and expiry without negative values', () => {
  const timer = { deadline: 601000, remaining: 600 };
  assert.equal(timerRemaining(timer, 1000), 600);
  assert.equal(timerRemaining(timer, 102500), 499);
  assert.equal(timerRemaining(timer, 602000), 0);
  assert.equal(timerRemaining({ deadline: null, remaining: 451 }, 999999), 451);
  assert.equal(timerRemaining(null), 600);
});

test('real batch notes survive a JSON round trip and input is normalized', () => {
  const batch = example();
  assert.ok(validNotebook(JSON.parse(JSON.stringify({ version: 1, batches: [batch] }))));
  assert.equal(makeBatch({ ...batch, name: '  Dinner  ' }, 'new').name, 'Dinner');
  assert.equal(makeBatch({ ...batch, notes: 'x'.repeat(3000) }, 'new').notes.length, 2000);
  assert.throws(() => makeBatch({ ...batch, heat: 6 }, 'new'));
  assert.throws(() => makeBatch({ ...batch, soakHours: -1 }, 'new'));
});

test('backup validation rejects malformed, oversized, duplicate, and missing-date records', () => {
  const batch = example();
  for (const value of [null, {}, { version: 2, batches: [] }, { version: 1, batches: [null] }, { version: 1, batches: [batch, batch] }, { version: 1, batches: [{ ...batch, date: undefined }] }, { version: 1, batches: [{ ...batch, date: 'banana' }] }, { version: 1, batches: [{ ...batch, notes: 'x'.repeat(2001) }] }, { version: 1, batches: Array(101).fill(batch) }]) assert.equal(validNotebook(value), false);
});
