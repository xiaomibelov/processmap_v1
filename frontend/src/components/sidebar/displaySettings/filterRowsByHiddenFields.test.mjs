// Unit tests for filterRowsByHiddenFields (property-panel-redesign).
// Covers AC4: overlay preview rows are filtered by the per-field chip filter at
// preview level — a row is hidden only when its field is explicitly listed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  filterRowsByHiddenFields,
  rowFieldName,
} from './filterRowsByHiddenFields.js';

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

test('filterRowsByHiddenFields: drops only listed fields, preserves order', () => {
  const rows = [
    { key: 'ee_time', label: 'ee_time', value: '0.33' },
    { key: 'ingredient', label: 'ingredient', value: 'salt' },
    { key: 'ingredient_value', label: 'ingredient_value', value: '10' },
  ];
  const out = filterRowsByHiddenFields(rows, ['ingredient']);
  assert.deepEqual(out.map((r) => r.key), ['ee_time', 'ingredient_value']);
});

test('filterRowsByHiddenFields: IO rows match by inner name', () => {
  const rows = [
    { key: 'IN:temp', label: 'IN temp', value: '80' },
    { key: 'OUT:weight', label: 'OUT weight', value: '1' },
    { key: 'ee_time', label: 'ee_time', value: '0.33' },
  ];
  const out = filterRowsByHiddenFields(rows, ['temp']);
  assert.deepEqual(out.map((r) => r.key), ['OUT:weight', 'ee_time']);
});

test('filterRowsByHiddenFields: fields not listed stay visible (active by default)', () => {
  const rows = [
    { key: 'custom_field', label: 'custom_field', value: 'x' },
    { key: 'ee_time', label: 'ee_time', value: '0.33' },
  ];
  // custom_field is not in any dictionary/chip list — it must NOT disappear.
  const out = filterRowsByHiddenFields(rows, ['ee_time']);
  assert.deepEqual(out.map((r) => r.key), ['custom_field']);
});

test('filterRowsByHiddenFields: empty hiddenFields keeps everything', () => {
  const rows = [{ key: 'ee_time', label: 'ee_time', value: '0.33' }];
  const out = filterRowsByHiddenFields(rows, []);
  assert.equal(out.length, 1);
});

test('filterRowsByHiddenFields: non-array hiddenFields -> no filtering', () => {
  const rows = [{ key: 'ee_time', label: 'ee_time', value: '0.33' }];
  const out = filterRowsByHiddenFields(rows, undefined);
  assert.equal(out.length, 1);
  assert.notEqual(out, rows, 'returns a copy, not the input reference');
});

test('filterRowsByHiddenFields: non-array rows -> empty array', () => {
  assert.deepEqual(filterRowsByHiddenFields(null, ['ee_time']), []);
  assert.deepEqual(filterRowsByHiddenFields('oops', ['ee_time']), []);
});

test('filterRowsByHiddenFields: input is not mutated', () => {
  const rows = [
    { key: 'ee_time', label: 'ee_time', value: '0.33' },
    { key: 'ingredient', label: 'ingredient', value: 'salt' },
  ];
  const snapshot = JSON.parse(JSON.stringify(rows));
  filterRowsByHiddenFields(rows, ['ee_time']);
  assert.deepEqual(rows, snapshot);
});
