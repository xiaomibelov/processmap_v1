// Unit tests for the overlay display settings model (property-panel-redesign).
// Covers AC2 (mutually exclusive modes by construction), AC3 (persistence +
// legacy migration), AC4 (per-field filter semantics: hidden fields are
// opt-out, fields are active by default), and the validation contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DISPLAY_MODES,
  V2_MODES,
  applyV2ModeChange,
  createDefaultDisplaySettings,
  sanitizeDisplayMode,
  sanitizeV2Mode,
  sanitizeHiddenFields,
  readOverlayDisplaySettings,
  migrateLegacyAlwaysFlag,
  overlayDisplaySettingsStorageKey,
  loadOverlayDisplaySettings,
  saveOverlayDisplaySettings,
} from './overlayDisplaySettings.js';

test('constants expose exactly the documented modes', () => {
  assert.deepEqual(DISPLAY_MODES, ['hover', 'always', 'hidden']);
  assert.deepEqual(V2_MODES, ['none', 'all', 'expanded']);
});

test('createDefaultDisplaySettings: hover + none + nothing hidden', () => {
  assert.deepEqual(createDefaultDisplaySettings(), {
    displayMode: 'hover',
    v2Mode: 'none',
    displayModeBeforeV2: null,
    hiddenFields: [],
  });
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

test('sanitizeHiddenFields: array is deduped and non-strings dropped', () => {
  assert.deepEqual(
    sanitizeHiddenFields(['ee_time', 'ee_time', 'ingredient', 5, null, 'ingredient']),
    ['ee_time', 'ingredient'],
  );
});

test('sanitizeHiddenFields: non-array -> null (caller applies default)', () => {
  assert.equal(sanitizeHiddenFields(undefined), null);
  assert.equal(sanitizeHiddenFields('ee_time'), null);
  assert.equal(sanitizeHiddenFields({ 0: 'ee_time' }), null);
});

test('sanitizeHiddenFields: empty array stays empty (nothing hidden)', () => {
  assert.deepEqual(sanitizeHiddenFields([]), []);
});

test('readOverlayDisplaySettings: valid raw passes through', () => {
  const raw = { displayMode: 'always', v2Mode: 'expanded', displayModeBeforeV2: 'hover', hiddenFields: ['ee_time'] };
  assert.deepEqual(readOverlayDisplaySettings(raw), {
    displayMode: 'always',
    v2Mode: 'expanded',
    displayModeBeforeV2: 'hover',
    hiddenFields: ['ee_time'],
  });
});

test('readOverlayDisplaySettings: garbage raw -> defaults', () => {
  assert.deepEqual(readOverlayDisplaySettings('not-an-object'), createDefaultDisplaySettings());
  assert.deepEqual(readOverlayDisplaySettings(null), createDefaultDisplaySettings());
  assert.deepEqual(readOverlayDisplaySettings(undefined), createDefaultDisplaySettings());
});

test('readOverlayDisplaySettings: partial garbage is repaired field-by-field', () => {
  const settings = readOverlayDisplaySettings({ displayMode: 'ALWAYS', v2Mode: 'all', hiddenFields: 'oops' });
  assert.equal(settings.displayMode, 'hover');
  assert.equal(settings.v2Mode, 'all');
  assert.deepEqual(settings.hiddenFields, []);
});

test('migrateLegacyAlwaysFlag: true-ish -> always, everything else -> hover', () => {
  assert.equal(migrateLegacyAlwaysFlag(true), 'always');
  assert.equal(migrateLegacyAlwaysFlag('true'), 'always');
  assert.equal(migrateLegacyAlwaysFlag('1'), 'always');
  assert.equal(migrateLegacyAlwaysFlag(1), 'always');
  assert.equal(migrateLegacyAlwaysFlag('yes'), 'always');
  assert.equal(migrateLegacyAlwaysFlag('on'), 'always');
  assert.equal(migrateLegacyAlwaysFlag(false), 'hover');
  assert.equal(migrateLegacyAlwaysFlag('0'), 'hover');
  assert.equal(migrateLegacyAlwaysFlag(null), 'hover');
  assert.equal(migrateLegacyAlwaysFlag(undefined), 'hover');
});

test('expanded mode needs no separate enabled flag (structural invariant)', () => {
  const settings = createDefaultDisplaySettings();
  assert.deepEqual(Object.keys(settings).sort(), ['displayMode', 'displayModeBeforeV2', 'hiddenFields', 'v2Mode']);
  settings.v2Mode = 'expanded';
  assert.equal('v2Enabled' in settings, false);
  assert.equal('v2Expanded' in settings, false);
});

// --- Persistence layer: load/save with legacy migration, injectable storage ---

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

test('overlayDisplaySettingsStorageKey: prefix + session id', () => {
  assert.equal(overlayDisplaySettingsStorageKey('abc'), 'fpc_overlay_display_v1:abc');
  assert.equal(overlayDisplaySettingsStorageKey('  abc '), 'fpc_overlay_display_v1:abc');
  assert.equal(overlayDisplaySettingsStorageKey(''), '');
  assert.equal(overlayDisplaySettingsStorageKey(null), '');
});

test('loadOverlayDisplaySettings: no storage -> defaults', () => {
  assert.deepEqual(loadOverlayDisplaySettings(null, 's1'), createDefaultDisplaySettings());
  assert.deepEqual(loadOverlayDisplaySettings(undefined, 's1'), createDefaultDisplaySettings());
});

test('loadOverlayDisplaySettings: reads and validates stored value', () => {
  const storage = makeStorage({
    'fpc_overlay_display_v1:s1': JSON.stringify({ displayMode: 'always', v2Mode: 'expanded', hiddenFields: ['ee_time'] }),
  });
  assert.deepEqual(loadOverlayDisplaySettings(storage, 's1'), {
    displayMode: 'always',
    v2Mode: 'expanded',
    displayModeBeforeV2: null,
    hiddenFields: ['ee_time'],
  });
});

test('loadOverlayDisplaySettings: corrupt JSON falls back to legacy migration', () => {
  const storage = makeStorage({
    'fpc_overlay_display_v1:s1': '{not json',
    'fpc_properties_overlay_always_v1:s1': '1',
  });
  const settings = loadOverlayDisplaySettings(storage, 's1');
  assert.equal(settings.displayMode, 'always');
  assert.deepEqual(settings.hiddenFields, []);
});

test('loadOverlayDisplaySettings: migrates legacy always-flag when new key absent', () => {
  const on = makeStorage({ 'fpc_properties_overlay_always_v1:s1': '1' });
  assert.equal(loadOverlayDisplaySettings(on, 's1').displayMode, 'always');
  const off = makeStorage({ 'fpc_properties_overlay_always_v1:s1': '0' });
  assert.equal(loadOverlayDisplaySettings(off, 's1').displayMode, 'hover');
});

test('loadOverlayDisplaySettings: new key wins over legacy', () => {
  const storage = makeStorage({
    'fpc_overlay_display_v1:s1': JSON.stringify({ displayMode: 'hidden', v2Mode: 'none', hiddenFields: [] }),
    'fpc_properties_overlay_always_v1:s1': '1',
  });
  assert.equal(loadOverlayDisplaySettings(storage, 's1').displayMode, 'hidden');
});

test('saveOverlayDisplaySettings: writes validated JSON, round-trip stable', () => {
  const storage = makeStorage();
  const ok = saveOverlayDisplaySettings(storage, 's1', { displayMode: 'always', v2Mode: 'all', hiddenFields: ['ee_time'] });
  assert.equal(ok, true);
  const stored = JSON.parse(storage.getItem('fpc_overlay_display_v1:s1'));
  assert.deepEqual(stored, { displayMode: 'always', v2Mode: 'all', displayModeBeforeV2: null, hiddenFields: ['ee_time'] });
  assert.deepEqual(loadOverlayDisplaySettings(storage, 's1'), stored);
});

test('saveOverlayDisplaySettings: sanitizes before writing', () => {
  const storage = makeStorage();
  saveOverlayDisplaySettings(storage, 's1', { displayMode: 'WRONG', v2Mode: null, displayModeBeforeV2: 'WRONG', hiddenFields: 'oops' });
  const stored = JSON.parse(storage.getItem('fpc_overlay_display_v1:s1'));
  assert.deepEqual(stored, { displayMode: 'hover', v2Mode: 'none', displayModeBeforeV2: null, hiddenFields: [] });
});

test('saveOverlayDisplaySettings: throwing storage -> false, no crash', () => {
  const storage = { getItem: () => null, setItem: () => { throw { name: 'QuotaExceededError' }; } };
  assert.equal(saveOverlayDisplaySettings(storage, 's1', createDefaultDisplaySettings()), false);
});

test('saveOverlayDisplaySettings: empty session id -> false, nothing written', () => {
  const storage = makeStorage();
  assert.equal(saveOverlayDisplaySettings(storage, '', createDefaultDisplaySettings()), false);
  assert.equal(storage._map.size, 0);
});

// --- V2 → displayMode coupling (applyV2ModeChange) ---

test('applyV2ModeChange: turning V2 on forces displayMode=hidden and remembers the previous mode', () => {
  const prev = { displayMode: 'always', v2Mode: 'none', displayModeBeforeV2: null, hiddenFields: [] };
  const next = applyV2ModeChange(prev, 'all');
  assert.equal(next.v2Mode, 'all');
  assert.equal(next.displayMode, 'hidden');
  assert.equal(next.displayModeBeforeV2, 'always');
  assert.deepEqual(next.hiddenFields, []);
});

test('applyV2ModeChange: turning V2 off restores the remembered display mode', () => {
  const prev = { displayMode: 'hidden', v2Mode: 'all', displayModeBeforeV2: 'always', hiddenFields: [] };
  const next = applyV2ModeChange(prev, 'none');
  assert.equal(next.v2Mode, 'none');
  assert.equal(next.displayMode, 'always');
  assert.equal(next.displayModeBeforeV2, null);
});

test('applyV2ModeChange: turning V2 off without a stored previous falls back sanely', () => {
  const prev = { displayMode: 'hidden', v2Mode: 'expanded', displayModeBeforeV2: null, hiddenFields: [] };
  const next = applyV2ModeChange(prev, 'none');
  assert.equal(next.v2Mode, 'none');
  // beforeV2 is null -> falls back to the current mode ("hidden" by then);
  // acceptable, the user can re-pick explicitly. Never an invalid value.
  assert.ok(DISPLAY_MODES.includes(next.displayMode));
  assert.equal(next.displayMode, 'hidden');
  assert.equal(next.displayModeBeforeV2, null);
});

test('applyV2ModeChange: switching between V2 modes keeps a single beforeV2', () => {
  const prev = { displayMode: 'hidden', v2Mode: 'all', displayModeBeforeV2: 'always', hiddenFields: [] };
  const next = applyV2ModeChange(prev, 'expanded');
  assert.equal(next.v2Mode, 'expanded');
  assert.equal(next.displayMode, 'hidden');
  assert.equal(next.displayModeBeforeV2, 'always', 'beforeV2 must not be overwritten by the forced hidden mode');
});

test('applyV2ModeChange: none -> none only sanitizes v2Mode', () => {
  const prev = { displayMode: 'hover', v2Mode: 'none', displayModeBeforeV2: null, hiddenFields: ['x'] };
  const next = applyV2ModeChange(prev, 'none');
  assert.deepEqual(next, prev);
});

test('applyV2ModeChange: invalid nextV2Mode is sanitized (treated as off)', () => {
  const prev = { displayMode: 'hidden', v2Mode: 'all', displayModeBeforeV2: 'hover', hiddenFields: [] };
  const next = applyV2ModeChange(prev, 'garbage');
  assert.equal(next.v2Mode, 'none');
  assert.equal(next.displayMode, 'hover');
});

test('persistence round-trips displayModeBeforeV2', () => {
  const storage = makeStorage();
  const ok = saveOverlayDisplaySettings(storage, 's1', {
    displayMode: 'hidden', v2Mode: 'all', displayModeBeforeV2: 'always', hiddenFields: [],
  });
  assert.equal(ok, true);
  const loaded = loadOverlayDisplaySettings(storage, 's1');
  assert.equal(loaded.displayModeBeforeV2, 'always');
});

test('direct displayMode change leaves v2Mode and beforeV2 untouched', () => {
  // Same merge semantics as useOverlayDisplaySettings.setDisplayMode.
  const prev = { displayMode: 'hidden', v2Mode: 'all', displayModeBeforeV2: 'always', hiddenFields: [] };
  const next = { ...prev, displayMode: sanitizeDisplayMode('hover') };
  assert.equal(next.displayMode, 'hover');
  assert.equal(next.v2Mode, 'all');
  assert.equal(next.displayModeBeforeV2, 'always');
});
