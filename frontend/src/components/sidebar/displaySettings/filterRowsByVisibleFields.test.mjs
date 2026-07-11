// Unit tests for filterRowsByVisibleFields (property-panel-redesign, Phase 0).
// Covers AC4: overlay preview rows are filtered by the per-field chip filter at
// preview level — data (draft/XML) is never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  filterRowsByVisibleFields,
  rowFieldName,
} from './filterRowsByVisibleFields.js';

test('rowFieldName: prefers explicit name', () => {
  assert.equal(rowFieldName({ name: 'ee_time', key: 'whatever' }), 'ee_time');
});

test('rowFieldName: plain key is the field name', () => {
  assert.equal(rowFieldName({ key: 'ingredient_value', label: 'ingredient_value' }), 'ingredient_value');
});

test('rowFieldName: IO-prefixed key yields the part after the prefix', () => {
  assert.equal(rowFieldName({ key: 'IN:temp', label: 'IN temp' }), 'temp');
  assert.equal(rowFieldName({ key: 'OUT:weight' }), 'weight');
});

test('rowFieldName: missing name/key -> empty string', () => {
  assert.equal(rowFieldName({}), '');
  assert.equal(rowFieldName(null), '');
  assert.equal(rowFieldName('oops'), '');
});

test('filterRowsByVisibleFields: keeps only listed fields, preserves order', () => {
  const rows = [
    { key: 'ee_time', label: 'ee_time', value: '0.33' },
    { key: 'ingredient', label: 'ingredient', value: 'salt' },
    { key: 'ingredient_value', label: 'ingredient_value', value: '10' },
  ];
  const out = filterRowsByVisibleFields(rows, ['ingredient_value', 'ee_time']);
  assert.deepEqual(out.map((r) => r.key), ['ee_time', 'ingredient_value']);
});

test('filterRowsByVisibleFields: IO rows match by inner name', () => {
  const rows = [
    { key: 'IN:temp', label: 'IN temp', value: '80' },
    { key: 'OUT:weight', label: 'OUT weight', value: '1' },
    { key: 'ee_time', label: 'ee_time', value: '0.33' },
  ];
  const out = filterRowsByVisibleFields(rows, ['temp', 'ee_time']);
  assert.deepEqual(out.map((r) => r.key), ['IN:temp', 'ee_time']);
});

test('filterRowsByVisibleFields: empty visibleFields hides everything', () => {
  const rows = [{ key: 'ee_time', label: 'ee_time', value: '0.33' }];
  assert.deepEqual(filterRowsByVisibleFields(rows, []), []);
});

test('filterRowsByVisibleFields: non-array visibleFields -> no filtering', () => {
  const rows = [{ key: 'ee_time', label: 'ee_time', value: '0.33' }];
  const out = filterRowsByVisibleFields(rows, undefined);
  assert.equal(out.length, 1);
  assert.notEqual(out, rows, 'returns a copy, not the input reference');
});

test('filterRowsByVisibleFields: non-array rows -> empty array', () => {
  assert.deepEqual(filterRowsByVisibleFields(null, ['ee_time']), []);
  assert.deepEqual(filterRowsByVisibleFields('oops', ['ee_time']), []);
});

test('filterRowsByVisibleFields: input is not mutated', () => {
  const rows = [
    { key: 'ee_time', label: 'ee_time', value: '0.33' },
    { key: 'ingredient', label: 'ingredient', value: 'salt' },
  ];
  const snapshot = JSON.parse(JSON.stringify(rows));
  filterRowsByVisibleFields(rows, ['ee_time']);
  assert.deepEqual(rows, snapshot);
});
