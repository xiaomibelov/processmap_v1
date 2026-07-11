// Unit tests for the overlay display settings model (property-panel-redesign, Phase 0).
// Covers AC2 (mutually exclusive modes by construction), AC3 (persistence + legacy
// migration), and the validation contract from API.md §4 (untrusted localStorage input).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DISPLAY_MODES,
  V2_MODES,
  createDefaultDisplaySettings,
  sanitizeDisplayMode,
  sanitizeV2Mode,
  sanitizeVisibleFields,
  readOverlayDisplaySettings,
  migrateLegacyAlwaysFlag,
} from './overlayDisplaySettings.js';

test('constants expose exactly the documented modes', () => {
  assert.deepEqual(DISPLAY_MODES, ['hover', 'always', 'hidden']);
  assert.deepEqual(V2_MODES, ['none', 'all', 'expanded']);
});

test('createDefaultDisplaySettings: hover + none + all known fields', () => {
  const settings = createDefaultDisplaySettings(['ee_time', 'ingredient_value']);
  assert.equal(settings.displayMode, 'hover');
  assert.equal(settings.v2Mode, 'none');
  assert.deepEqual(settings.visibleFields, ['ee_time', 'ingredient_value']);
});

test('createDefaultDisplaySettings: defensive copy of knownFields', () => {
  const known = ['ee_time'];
  const settings = createDefaultDisplaySettings(known);
  known.push('ingredient_value');
  assert.deepEqual(settings.visibleFields, ['ee_time']);
});

test('createDefaultDisplaySettings: no known fields -> empty list', () => {
  assert.deepEqual(createDefaultDisplaySettings().visibleFields, []);
  assert.deepEqual(createDefaultDisplaySettings(null).visibleFields, []);
});

test('sanitizeDisplayMode: invalid values fall back to hover', () => {
  assert.equal(sanitizeDisplayMode('always'), 'always');
  assert.equal(sanitizeDisplayMode('hidden'), 'hidden');
  assert.equal(sanitizeDisplayMode('hover'), 'hover');
  assert.equal(sanitizeDisplayMode('garbage'), 'hover');
  assert.equal(sanitizeDisplayMode(undefined), 'hover');
  assert.equal(sanitizeDisplayMode(42), 'hover');
  assert.equal(sanitizeDisplayMode(null), 'hover');
});

test('sanitizeV2Mode: invalid values fall back to none', () => {
  assert.equal(sanitizeV2Mode('all'), 'all');
  assert.equal(sanitizeV2Mode('expanded'), 'expanded');
  assert.equal(sanitizeV2Mode('none'), 'none');
  assert.equal(sanitizeV2Mode('expanded-but-disabled'), 'none');
  assert.equal(sanitizeV2Mode(undefined), 'none');
  assert.equal(sanitizeV2Mode({}), 'none');
});

test('sanitizeVisibleFields: array is deduped and non-strings dropped', () => {
  assert.deepEqual(
    sanitizeVisibleFields(['ee_time', 'ee_time', 'ingredient', 5, null, 'ingredient']),
    ['ee_time', 'ingredient'],
  );
});

test('sanitizeVisibleFields: non-array -> null (caller applies default)', () => {
  assert.equal(sanitizeVisibleFields(undefined), null);
  assert.equal(sanitizeVisibleFields('ee_time'), null);
  assert.equal(sanitizeVisibleFields({ 0: 'ee_time' }), null);
});

test('sanitizeVisibleFields: empty array stays empty (all fields hidden)', () => {
  assert.deepEqual(sanitizeVisibleFields([]), []);
});

test('readOverlayDisplaySettings: valid raw passes through', () => {
  const raw = { displayMode: 'always', v2Mode: 'expanded', visibleFields: ['ee_time'] };
  assert.deepEqual(readOverlayDisplaySettings(raw, ['ee_time', 'ingredient']), {
    displayMode: 'always',
    v2Mode: 'expanded',
    visibleFields: ['ee_time'],
  });
});

test('readOverlayDisplaySettings: garbage raw -> defaults', () => {
  const known = ['ee_time', 'ingredient_value'];
  assert.deepEqual(readOverlayDisplaySettings('not-an-object', known), createDefaultDisplaySettings(known));
  assert.deepEqual(readOverlayDisplaySettings(null, known), createDefaultDisplaySettings(known));
  assert.deepEqual(readOverlayDisplaySettings(undefined, known), createDefaultDisplaySettings(known));
});

test('readOverlayDisplaySettings: partial garbage is repaired field-by-field', () => {
  const settings = readOverlayDisplaySettings(
    { displayMode: 'ALWAYS', v2Mode: 'all', visibleFields: 'oops' },
    ['ee_time'],
  );
  assert.equal(settings.displayMode, 'hover');
  assert.equal(settings.v2Mode, 'all');
  assert.deepEqual(settings.visibleFields, ['ee_time']);
});

test('readOverlayDisplaySettings: visibleFields=[] is respected (not replaced by default)', () => {
  const settings = readOverlayDisplaySettings({ displayMode: 'hover', v2Mode: 'none', visibleFields: [] }, ['ee_time']);
  assert.deepEqual(settings.visibleFields, []);
});

test('migrateLegacyAlwaysFlag: true -> always, everything else -> hover', () => {
  assert.equal(migrateLegacyAlwaysFlag(true), 'always');
  assert.equal(migrateLegacyAlwaysFlag('true'), 'always');
  assert.equal(migrateLegacyAlwaysFlag('1'), 'always');
  assert.equal(migrateLegacyAlwaysFlag(1), 'always');
  assert.equal(migrateLegacyAlwaysFlag(false), 'hover');
  assert.equal(migrateLegacyAlwaysFlag('false'), 'hover');
  assert.equal(migrateLegacyAlwaysFlag(null), 'hover');
  assert.equal(migrateLegacyAlwaysFlag(undefined), 'hover');
});

test('expanded mode needs no separate enabled flag (structural invariant)', () => {
  const settings = createDefaultDisplaySettings(['ee_time']);
  assert.deepEqual(Object.keys(settings).sort(), ['displayMode', 'v2Mode', 'visibleFields']);
  settings.v2Mode = 'expanded';
  // 'expanded' is a single self-sufficient value — no v2Enabled boolean exists.
  assert.equal('v2Enabled' in settings, false);
  assert.equal('v2Expanded' in settings, false);
});
