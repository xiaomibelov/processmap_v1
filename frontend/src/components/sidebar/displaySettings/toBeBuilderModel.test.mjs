// Unit tests for the To-Be builder derived model (property-panel-redesign, Phase 0).
// Covers AC6-AC8: As-Is/Pool lists, the four status badges, and summary pills.
// Terms follow the user document: "In To-Be" / "Removed" / "Added" / "Not filled",
// pills "X in To-Be / Y skipped".
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyToBeState,
  readToBeState,
  deriveToBeModel,
  toggleToBeName,
  markPropertyRemoved,
  TO_BE_STORAGE_PREFIX,
  loadToBeState,
  saveToBeState,
} from './toBeBuilderModel.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

test('createEmptyToBeState', () => {
  assert.deepEqual(createEmptyToBeState(), { toBe: [], removed: [] });
});

test('readToBeState: validates untrusted input', () => {
  assert.deepEqual(readToBeState(null), { toBe: [], removed: [] });
  assert.deepEqual(readToBeState('oops'), { toBe: [], removed: [] });
  assert.deepEqual(
    readToBeState({ toBe: ['ee_time', 'ee_time', 5, 'ingredient'], removed: ['document', null] }),
    { toBe: ['ee_time', 'ingredient'], removed: ['document'] },
  );
});

test('deriveToBeModel: empty state -> all configured are Added, dictionary is Not filled', () => {
  const model = deriveToBeModel({
    toBeState: createEmptyToBeState(),
    asIsNames: ['ee_time'],
    dictionaryNames: ['ee_time', 'ingredient_value'],
  });
  assert.deepEqual(model.asIs, [{ name: 'ee_time', badge: 'Added' }]);
  assert.deepEqual(model.pool, [{ name: 'ingredient_value', badge: 'Not filled' }]);
  assert.equal(model.inToBeCount, 0);
  assert.equal(model.skippedCount, 0);
  assert.equal(model.pillsText, '0 in To-Be / 0 skipped');
});

test('deriveToBeModel: toBe membership drives badges and pills', () => {
  const model = deriveToBeModel({
    toBeState: { toBe: ['ee_time', 'ingredient_value'], removed: [] },
    asIsNames: ['ee_time', 'container_tara'],
    dictionaryNames: ['ee_time', 'ingredient_value'],
  });
  assert.deepEqual(model.asIs, [
    { name: 'ee_time', badge: 'In To-Be' },
    { name: 'container_tara', badge: 'Added' },
  ]);
  assert.deepEqual(model.pool, [{ name: 'ingredient_value', badge: 'Not filled' }]);
  assert.equal(model.inToBeCount, 1);
  assert.equal(model.skippedCount, 1);
  assert.equal(model.pillsText, '1 in To-Be / 1 skipped');
});

test('deriveToBeModel: removed-tracked skipped fields show Removed badge', () => {
  const model = deriveToBeModel({
    toBeState: { toBe: ['ee_time', 'document'], removed: ['document'] },
    asIsNames: ['ee_time'],
    dictionaryNames: [],
  });
  assert.deepEqual(model.pool, [{ name: 'document', badge: 'Removed' }]);
  assert.equal(model.skippedCount, 1);
});

test('deriveToBeModel: duplicate asIs names are deduped (x3 guard)', () => {
  const model = deriveToBeModel({
    toBeState: { toBe: ['ee_time'], removed: [] },
    asIsNames: ['ee_time', 'ee_time', 'ee_time'],
    dictionaryNames: [],
  });
  assert.deepEqual(model.asIs, [{ name: 'ee_time', badge: 'In To-Be' }]);
  assert.equal(model.inToBeCount, 1);
});

test('deriveToBeModel: pool = (dictionary ∪ toBe) minus asIs, deduped', () => {
  const model = deriveToBeModel({
    toBeState: { toBe: ['document'], removed: [] },
    asIsNames: ['ee_time'],
    dictionaryNames: ['ee_time', 'ingredient', 'document'],
  });
  assert.deepEqual(model.pool.map((p) => p.name), ['ingredient', 'document']);
});

test('toggleToBeName: adds and removes from the toBe set', () => {
  const start = createEmptyToBeState();
  const withField = toggleToBeName(start, 'ee_time');
  assert.deepEqual(withField, { toBe: ['ee_time'], removed: [] });
  assert.deepEqual(toggleToBeName(withField, 'ee_time'), createEmptyToBeState());
  assert.deepEqual(start, createEmptyToBeState(), 'input not mutated');
});

test('toggleToBeName: adding clears the removed marker', () => {
  const state = { toBe: [], removed: ['document'] };
  assert.deepEqual(toggleToBeName(state, 'document'), { toBe: ['document'], removed: [] });
});

test('markPropertyRemoved: tracks removal only for toBe members', () => {
  const state = { toBe: ['ee_time', 'document'], removed: [] };
  assert.deepEqual(markPropertyRemoved(state, 'document'), { toBe: ['ee_time', 'document'], removed: ['document'] });
  assert.deepEqual(markPropertyRemoved(state, 'container_tara'), state);
});

test('markPropertyRemoved: immutable and deduped', () => {
  const state = { toBe: ['document'], removed: ['document'] };
  const out = markPropertyRemoved(state, 'document');
  assert.deepEqual(out, state);
  assert.notEqual(out, state, 'returns a copy');
});

test('loadToBeState: missing key / no storage / no session -> empty state', () => {
  const storage = createMemoryStorage();
  assert.deepEqual(loadToBeState(storage, 's1'), createEmptyToBeState());
  assert.deepEqual(loadToBeState(null, 's1'), createEmptyToBeState());
  assert.deepEqual(loadToBeState(storage, ''), createEmptyToBeState());
});

test('saveToBeState + loadToBeState: round-trip under the per-session key', () => {
  const storage = createMemoryStorage();
  saveToBeState(storage, 's1', { toBe: ['ee_time'], removed: ['document'] });
  assert.equal(storage.getItem(`${TO_BE_STORAGE_PREFIX}s1`) !== null, true);
  assert.deepEqual(loadToBeState(storage, 's1'), { toBe: ['ee_time'], removed: ['document'] });
  assert.deepEqual(loadToBeState(storage, 's2'), createEmptyToBeState(), 'other session unaffected');
});

test('loadToBeState: garbage or invalid JSON -> validated empty state', () => {
  const storage = createMemoryStorage();
  storage.setItem(`${TO_BE_STORAGE_PREFIX}s1`, '{not json');
  assert.deepEqual(loadToBeState(storage, 's1'), createEmptyToBeState());
  storage.setItem(`${TO_BE_STORAGE_PREFIX}s1`, JSON.stringify({ toBe: ['ee_time', 7], removed: 'x' }));
  assert.deepEqual(loadToBeState(storage, 's1'), { toBe: ['ee_time'], removed: [] });
});

test('saveToBeState: validates before write and tolerates no storage / no session', () => {
  const storage = createMemoryStorage();
  saveToBeState(storage, 's1', { toBe: ['ee_time', 'ee_time', 3], removed: null });
  assert.deepEqual(loadToBeState(storage, 's1'), { toBe: ['ee_time'], removed: [] });
  saveToBeState(storage, '', { toBe: ['ee_time'], removed: [] });
  assert.equal(storage.getItem(TO_BE_STORAGE_PREFIX), null);
  saveToBeState(null, 's1', { toBe: ['ee_time'], removed: [] });
});
