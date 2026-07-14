/**
 * Unified property CRUD boundary.
 *
 * Single source of truth: BPMN XML (camunda:property / zeebe:property).
 * bpmn_meta.camunda_extensions_by_element_id is treated as a read-only
 * projection that the backend re-derives from XML.
 *
 * The boundary:
 *  - reads the current XML draft,
 *  - mutates extension properties in memory,
 *  - applies the change optimistically to the live bpmn-js modeler,
 *  - serializes the updated XML,
 *  - persists via saveCoordinator (xml pipeline) through saveBpmnState,
 *  - notifies subscribers.
 */

import {
  createEmptyCamundaExtensionState,
  extractCamundaExtensionsMapFromBpmnXml,
  finalizeCamundaExtensionsXml,
  normalizeCamundaExtensionState,
  removeCamundaExtensionStateByElementId,
  upsertCamundaExtensionStateByElementId,
} from "./camunda/camundaExtensions.js";
import { saveBpmnState } from "./save/saveBpmnState.js";
import { apiPutBpmnXml } from "../../lib/api.js";

function asText(value) {
  return String(value || "").trim();
}

function cloneExtensionMap(map) {
  // Shallow clone of the map; nested states are replaced during mutation.
  return { ...(map || {}) };
}

function cloneExtensionState(state) {
  if (!state || typeof state !== "object") return createEmptyCamundaExtensionState();
  return {
    properties: {
      extensionProperties: Array.isArray(state.properties?.extensionProperties)
        ? state.properties.extensionProperties.map((p) => ({ ...p }))
        : [],
      extensionListeners: Array.isArray(state.properties?.extensionListeners)
        ? state.properties.extensionListeners.map((l) => ({ ...l }))
        : [],
    },
    preservedExtensionElements: Array.isArray(state.preservedExtensionElements)
      ? [...state.preservedExtensionElements]
      : [],
  };
}

function findPropertyIndex(properties, name) {
  const key = asText(name).toLowerCase();
  return properties.findIndex((p) => asText(p?.name).toLowerCase() === key);
}

class PropertyCrudBoundary {
  constructor() {
    this.runtime = null;
    this.currentXml = "";
    this.currentMeta = {};
    this.subscribers = new Map();
    this.debounceTimer = null;
    this.saving = false;
    this.status = { state: "idle", detail: null };
  }

  /**
   * Register runtime callbacks. Must be called once before any CRUD operation.
   */
  registerRuntime(runtime = {}) {
    this.runtime = runtime;
    this._resetCache();
  }

  _resetCache() {
    this.currentXml = String(this.runtime?.getCurrentXml?.() || "");
    this.currentMeta = this.runtime?.getCurrentBpmnMeta?.() || {};
  }

  _getSessionId() {
    return asText(this.runtime?.getSessionId?.());
  }

  _extractMap() {
    return extractCamundaExtensionsMapFromBpmnXml(this.currentXml);
  }

  _setStatus(state, detail = null) {
    this.status = { state, detail };
    this._notify(null, { type: "status", state, detail });
  }

  /**
   * Read a single property value for an element.
   * Returns undefined if the property is absent.
   */
  getProperty(elementId, propertyKey) {
    const map = this._extractMap();
    const elementState = map[elementId];
    const properties = elementState?.properties?.extensionProperties || [];
    const idx = findPropertyIndex(properties, propertyKey);
    return idx >= 0 ? properties[idx].value : undefined;
  }

  /**
   * Read all extension properties for an element.
   * Returns [{ id, name, value }].
   */
  getProperties(elementId) {
    const map = this._extractMap();
    const elementState = map[elementId];
    const properties = elementState?.properties?.extensionProperties || [];
    return properties.map((p) => ({ id: p.id, name: p.name, value: p.value }));
  }

  /**
   * Set a single property.
   */
  async setProperty(elementId, propertyKey, value, options = {}) {
    return this.setProperties(elementId, { [propertyKey]: value }, options);
  }

  /**
   * Delete a single property.
   */
  async deleteProperty(elementId, propertyKey, options = {}) {
    return this.setProperties(elementId, { [propertyKey]: null }, options);
  }

  /**
   * Batch set/delete properties for an element.
   * Pass value === null to delete.
   */
  async setProperties(elementIdRaw, updates = {}, options = {}) {
    const elementId = asText(elementIdRaw);
    const sid = this._getSessionId();
    if (!elementId) return { ok: false, error: "missing element id" };
    if (!sid) return { ok: false, error: "session not ready" };

    const map = this._extractMap();
    const { nextMap, changed, changedKeys } = this._applyUpdates(map, elementId, updates);
    if (!changed) {
      return { ok: true, unchanged: true };
    }

    const nextState = nextMap[elementId] || createEmptyCamundaExtensionState();

    // Backup the live modeler state so we can roll back on failure.
    const backupState = this.runtime?.getElementCamundaExtensionState?.(elementId) || null;

    // Optimistically apply to the live modeler.
    const applyResult = this.runtime?.applyElementCamundaExtensionsToModeler
      ? this.runtime.applyElementCamundaExtensionsToModeler(elementId, nextState)
      : { ok: true };
    if (applyResult && !applyResult.ok) {
      return { ok: false, error: applyResult.error || "modeler apply failed" };
    }

    // Serialize the updated XML.
    const nextXml = finalizeCamundaExtensionsXml({
      xmlText: this.currentXml,
      camundaExtensionsByElementId: nextMap,
    });
    if (!nextXml) {
      this._rollbackModeler(elementId, backupState);
      return { ok: false, error: "xml serialization failed" };
    }

    // Update local cache and subscribers.
    this.currentXml = nextXml;
    this._notify(elementId, { type: "properties", keys: changedKeys });

    // Schedule durable save.
    this._scheduleSave(sid);

    return { ok: true, changedKeys };
  }

  /**
   * Replace the entire extension state for an element (properties + listeners +
   * preserved fragments). Used by legacy callers that work with full extension
   * state objects (e.g., NotesPanel / App.jsx setElementCamundaExtensions).
   */
  async setExtensionState(elementIdRaw, extensionStateRaw, options = {}) {
    const elementId = asText(elementIdRaw);
    const sid = this._getSessionId();
    if (!elementId) return { ok: false, error: "missing element id" };
    if (!sid) return { ok: false, error: "session not ready" };

    const shouldRemove = options?.remove === true || extensionStateRaw === null;
    const map = this._extractMap();
    const nextMap = shouldRemove
      ? removeCamundaExtensionStateByElementId(map, elementId)
      : upsertCamundaExtensionStateByElementId(map, elementId, extensionStateRaw);
    const nextState = nextMap[elementId] || createEmptyCamundaExtensionState();

    const backupState = this.runtime?.getElementCamundaExtensionState?.(elementId) || null;
    const applyResult = this.runtime?.applyElementCamundaExtensionsToModeler
      ? this.runtime.applyElementCamundaExtensionsToModeler(elementId, nextState)
      : { ok: true };
    if (applyResult && !applyResult.ok) {
      return { ok: false, error: applyResult.error || "modeler apply failed" };
    }

    const nextXml = finalizeCamundaExtensionsXml({
      xmlText: this.currentXml,
      camundaExtensionsByElementId: nextMap,
    });
    if (!nextXml) {
      this._rollbackModeler(elementId, backupState);
      return { ok: false, error: "xml serialization failed" };
    }

    this.currentXml = nextXml;
    this._notify(elementId, { type: "properties" });
    this._scheduleSave(sid);
    return { ok: true };
  }

  /**
   * Delete the entire extension state for an element.
   */
  async deleteExtensionState(elementId) {
    return this.setExtensionState(elementId, null, { remove: true });
  }

  _applyUpdates(map, elementId, updates) {
    const nextMap = cloneExtensionMap(map);
    const state = map[elementId]
      ? cloneExtensionState(map[elementId])
      : createEmptyCamundaExtensionState();

    let changed = false;
    const changedKeys = [];

    for (const [rawName, rawValue] of Object.entries(updates)) {
      const name = asText(rawName);
      if (!name) continue;
      const shouldDelete = rawValue === null || rawValue === undefined;
      const stringValue = shouldDelete ? "" : String(rawValue);
      const idx = findPropertyIndex(state.properties.extensionProperties, name);

      if (shouldDelete || stringValue === "") {
        if (idx >= 0) {
          state.properties.extensionProperties.splice(idx, 1);
          changed = true;
          changedKeys.push(name);
        }
      } else if (idx >= 0) {
        const existing = state.properties.extensionProperties[idx];
        if (existing.value !== stringValue) {
          existing.value = stringValue;
          changed = true;
          changedKeys.push(name);
        }
      } else {
        state.properties.extensionProperties.push({
          id: "",
          name,
          value: stringValue,
        });
        changed = true;
        changedKeys.push(name);
      }
    }

    const hasAnyState =
      state.properties.extensionProperties.length > 0
      || state.properties.extensionListeners.length > 0
      || state.preservedExtensionElements.length > 0;

    if (hasAnyState) {
      nextMap[elementId] = state;
    } else {
      delete nextMap[elementId];
    }

    return { nextMap, changed, changedKeys };
  }

  _rollbackModeler(elementId, backupState) {
    if (!backupState || !this.runtime?.applyElementCamundaExtensionsToModeler) return;
    try {
      this.runtime.applyElementCamundaExtensionsToModeler(elementId, backupState);
    } catch {
      // Best-effort rollback.
    }
  }

  /**
   * Subscribe to property changes for an element, or globally (elementId = null).
   * Callback receives ({ elementId?, type, keys?, state?, detail? }).
   */
  subscribe(elementIdRaw, callback) {
    const elementId = elementIdRaw === null || elementIdRaw === undefined ? "" : asText(elementIdRaw);
    if (typeof callback !== "function") return () => {};
    if (!this.subscribers.has(elementId)) {
      this.subscribers.set(elementId, new Set());
    }
    const set = this.subscribers.get(elementId);
    set.add(callback);
    return () => {
      set.delete(callback);
      if (set.size === 0) this.subscribers.delete(elementId);
    };
  }

  _notify(elementId, event = {}) {
    const payload = { ...event, elementId: elementId || undefined };
    // Global subscribers.
    const globalSet = this.subscribers.get("");
    if (globalSet) {
      globalSet.forEach((cb) => {
        try { cb(payload); } catch { /* ignore */ }
      });
    }
    // Element-specific subscribers.
    if (elementId) {
      const elementSet = this.subscribers.get(elementId);
      if (elementSet) {
        elementSet.forEach((cb) => {
          try { cb(payload); } catch { /* ignore */ }
        });
      }
    }
  }

  _scheduleSave(sid) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this._flushSave(sid);
    }, 300);
  }

  async _flushSave(sid) {
    if (this.saving) {
      // SaveCoordinator queues sequential executions, but we also serialize our
      // own debounces. If a previous flush is still running, re-schedule with
      // the latest XML after a short delay.
      setTimeout(() => this._scheduleSave(sid), 50);
      return;
    }

    this.saving = true;
    this._setStatus("saving");

    const xmlToSave = this.currentXml;
    const metaToSave = this.currentMeta;

    const result = await saveBpmnState({
      operation: "session_save",
      sessionId: sid,
      xml: xmlToSave,
      currentMeta: metaToSave,
      nextMeta: metaToSave,
      apiPutBpmnXml,
      getBaseDiagramStateVersion: this.runtime?.getBaseDiagramStateVersion,
      rememberDiagramStateVersion: this.runtime?.rememberDiagramStateVersion,
      onSessionSync: this.runtime?.onSessionSync,
      syncSource: "propertyCrudBoundary",
    });

    this.saving = false;

    if (result?.ok) {
      if (result.nextXml) {
        this.currentXml = result.nextXml;
      }
      this._setStatus("saved");
    } else {
      this._setStatus("error", result);
    }

    return result;
  }

  /**
   * Reset local cache from runtime (call after session switch / load).
   */
  reset() {
    this._resetCache();
    this.subscribers.clear();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.saving = false;
    this.status = { state: "idle", detail: null };
  }

  /**
   * Sync local XML cache after an external session update (e.g., background refresh).
   */
  syncXml(xml) {
    this.currentXml = String(xml || "");
  }

  getStatus() {
    return this.status;
  }

  isSaving() {
    return this.saving || this.status.state === "saving";
  }
}

export const propertyCrudBoundary = new PropertyCrudBoundary();

export default propertyCrudBoundary;
