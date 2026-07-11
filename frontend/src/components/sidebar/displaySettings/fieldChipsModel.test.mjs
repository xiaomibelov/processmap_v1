// Unit tests for the per-field chips model (property-panel-redesign, Phase 0).
// Covers AC4: chip list is the union of element properties, org dictionary and
// quick pins; active state mirrors visibleFields; toggle is immutable.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFieldChips,
  toggleFieldName,
} from './fieldChipsModel.js';

test('buildFieldChips: union of sources in first-occurrence order', () => {
  const chips = buildFieldChips({
    elementPropertyNames: ['ingredient', 'ee_time'],
    dictionaryNames: ['ee_time', 'container_tara'],
    quickNames: ['ingredient_value', 'ee_time'],
    visibleFields: ['ee_time', 'ingredient', 'container_tara', 'ingredient_value'],
  });
  assert.deepEqual(chips.map((c) => c.name), ['ingredient', 'ee_time', 'container_tara', 'ingredient_value']);
});

test('buildFieldChips: active mirrors visibleFields membership', () => {
  const chips = buildFieldChips({
    elementPropertyNames: ['ee_time', 'ingredient'],
    dictionaryNames: [],
    quickNames: [],
    visibleFields: ['ee_time'],
  });
  assert.deepEqual(chips, [
    { name: 'ee_time', label: 'ee_time', active: true },
    { name: 'ingredient', label: 'ingredient', active: false },
  ]);
});

test('buildFieldChips: empty visibleFields -> all chips inactive', () => {
  const chips = buildFieldChips({
    elementPropertyNames: ['ee_time'],
    dictionaryNames: ['ingredient'],
    quickNames: [],
    visibleFields: [],
  });
  assert.ok(chips.every((c) => c.active === false));
});

test('buildFieldChips: non-array visibleFields -> all active (defensive default)', () => {
  const chips = buildFieldChips({
    elementPropertyNames: ['ee_time'],
    dictionaryNames: [],
    quickNames: [],
    visibleFields: undefined,
  });
  assert.deepEqual(chips, [{ name: 'ee_time', label: 'ee_time', active: true }]);
});

test('buildFieldChips: skips empty/non-string names and trims', () => {
  const chips = buildFieldChips({
    elementPropertyNames: ['  ee_time  ', '', null, 42],
    dictionaryNames: ['ingredient'],
    quickNames: [],
    visibleFields: ['ee_time', 'ingredient'],
  });
  assert.deepEqual(chips.map((c) => c.name), ['ee_time', 'ingredient']);
});

test('buildFieldChips: visibleFields entries without a chip are ignored', () => {
  const chips = buildFieldChips({
    elementPropertyNames: ['ee_time'],
    dictionaryNames: [],
    quickNames: [],
    visibleFields: ['ee_time', 'ghost_field'],
  });
  assert.equal(chips.length, 1);
  assert.equal(chips[0].active, true);
});

test('buildFieldChips: missing sources -> empty chip list', () => {
  assert.deepEqual(buildFieldChips({ visibleFields: ['ee_time'] }), []);
  assert.deepEqual(buildFieldChips(), []);
});

test('toggleFieldName: removes an active field', () => {
  assert.deepEqual(toggleFieldName(['ee_time', 'ingredient'], 'ee_time'), ['ingredient']);
});

test('toggleFieldName: adds an inactive field', () => {
  assert.deepEqual(toggleFieldName(['ee_time'], 'ingredient'), ['ee_time', 'ingredient']);
});

test('toggleFieldName: immutable — input array untouched', () => {
  const input = ['ee_time'];
  toggleFieldName(input, 'ingredient');
  assert.deepEqual(input, ['ee_time']);
});

test('toggleFieldName: non-array input starts from empty list', () => {
  assert.deepEqual(toggleFieldName(undefined, 'ee_time'), ['ee_time']);
});

test('toggleFieldName: blank name is a no-op', () => {
  assert.deepEqual(toggleFieldName(['ee_time'], ''), ['ee_time']);
  assert.deepEqual(toggleFieldName(['ee_time'], null), ['ee_time']);
});
