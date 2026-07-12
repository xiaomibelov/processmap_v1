// Unit tests for the per-field chips model (property-panel-redesign).
// Covers AC4: chip list is the union of element properties, org dictionary and
// quick pins; active = NOT hidden (fields are active by default); toggle is
// immutable and operates on the hiddenFields list.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFieldChips,
  toggleFieldHidden,
} from './fieldChipsModel.js';

test('buildFieldChips: union of sources in first-occurrence order', () => {
  const chips = buildFieldChips({
    elementPropertyNames: ['ingredient', 'ee_time'],
    dictionaryNames: ['ee_time', 'container_tara'],
    quickNames: ['ingredient_value', 'ee_time'],
    hiddenFields: [],
  });
  assert.deepEqual(chips.map((c) => c.name), ['ingredient', 'ee_time', 'container_tara', 'ingredient_value']);
});

test('buildFieldChips: active = field NOT in hiddenFields', () => {
  const chips = buildFieldChips({
    elementPropertyNames: ['ee_time', 'ingredient'],
    dictionaryNames: [],
    quickNames: [],
    hiddenFields: ['ingredient'],
  });
  assert.deepEqual(chips, [
    { name: 'ee_time', label: 'ee_time', active: true },
    { name: 'ingredient', label: 'ingredient', active: false },
  ]);
});

test('buildFieldChips: empty hiddenFields -> all chips active', () => {
  const chips = buildFieldChips({
    elementPropertyNames: ['ee_time'],
    dictionaryNames: ['ingredient'],
    quickNames: [],
    hiddenFields: [],
  });
  assert.ok(chips.every((c) => c.active === true));
});

test('buildFieldChips: non-array hiddenFields -> all active (defensive default)', () => {
  const chips = buildFieldChips({
    elementPropertyNames: ['ee_time'],
    dictionaryNames: [],
    quickNames: [],
    hiddenFields: undefined,
  });
  assert.deepEqual(chips, [{ name: 'ee_time', label: 'ee_time', active: true }]);
});

test('buildFieldChips: skips empty/non-string names and trims', () => {
  const chips = buildFieldChips({
    elementPropertyNames: ['  ee_time  ', '', null, 42],
    dictionaryNames: ['ingredient'],
    quickNames: [],
    hiddenFields: [],
  });
  assert.deepEqual(chips.map((c) => c.name), ['ee_time', 'ingredient']);
});

test('buildFieldChips: hiddenFields entries without a chip are harmless', () => {
  const chips = buildFieldChips({
    elementPropertyNames: ['ee_time'],
    dictionaryNames: [],
    quickNames: [],
    hiddenFields: ['ghost_field'],
  });
  assert.equal(chips.length, 1);
  assert.equal(chips[0].active, true, 'unrelated hidden entry does not hide existing chips');
});

test('buildFieldChips: missing sources -> empty chip list', () => {
  assert.deepEqual(buildFieldChips({ hiddenFields: [] }), []);
  assert.deepEqual(buildFieldChips(), []);
});

test('toggleFieldHidden: hides an active field', () => {
  assert.deepEqual(toggleFieldHidden([], 'ee_time'), ['ee_time']);
});

test('toggleFieldHidden: un-hides a hidden field', () => {
  assert.deepEqual(toggleFieldHidden(['ee_time', 'ingredient'], 'ee_time'), ['ingredient']);
});

test('toggleFieldHidden: immutable — input array untouched', () => {
  const input = ['ee_time'];
  toggleFieldHidden(input, 'ingredient');
  assert.deepEqual(input, ['ee_time']);
});

test('toggleFieldHidden: non-array input starts from empty list', () => {
  assert.deepEqual(toggleFieldHidden(undefined, 'ee_time'), ['ee_time']);
});

test('toggleFieldHidden: blank name is a no-op', () => {
  assert.deepEqual(toggleFieldHidden(['ee_time'], ''), ['ee_time']);
  assert.deepEqual(toggleFieldHidden(['ee_time'], null), ['ee_time']);
});
