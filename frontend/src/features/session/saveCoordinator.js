/**
 * Unified save coordinator.
 *
 * Provides per-session sequential queues, per-pipeline debounce, retry with
 * exponential backoff, and a global event emitter for save status. All CAS
 * base diagram-state version updates go through casVersionTracker.
 */

import {
  getVersion as getTrackedDiagramStateVersion,
  bumpVersion as bumpTrackedDiagramStateVersion,
  rollbackVersion as rollbackTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
} from "../../lib/casVersionTracker.js";

function asText(value) {
  return String(value || "").trim();
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function debounceKey(pipelineName, sessionId) {
  return `${pipelineName}::${asText(sessionId)}`;
}

function queueKey(pipelineName, sessionId) {
  return `${asText(pipelineName)}::${asText(sessionId)}`;
}

function isConflictResponse(response) {
  if (!response || typeof response !== "object") return false;
  if (Number(response.status) === 409) return true;
  const text = `${String(response.error || "")} ${String(response.text || "")}`.toUpperCase();
  return text.includes("DIAGRAM_STATE_CONFLICT");
}

function pickServerCurrentVersion(response) {
  if (!response || typeof response !== "object") return null;
  const candidates = [
    response.server_current_version,
    response.serverCurrentVersion,
    response.data?.detail?.server_current_version,
    response.data?.detail?.serverCurrentVersion,
    response.errorDetails?.server_current_version,
    response.errorDetails?.serverCurrentVersion,
    response.details?.server_current_version,
    response.details?.serverCurrentVersion,
  ];
  for (const raw of candidates) {
    const n = asNumber(raw, -1);
    if (n >= 0) return Math.round(n);
  }
  return null;
}

function pickDiagramStateVersion(response) {
  if (!response || typeof response !== "object") return null;
  const candidates = [
    response.diagram_state_version,
    response.diagramStateVersion,
    response.session?.diagram_state_version,
    response.session?.diagramStateVersion,
    response.data?.diagram_state_version,
    response.data?.diagramStateVersion,
  ];
  for (const raw of candidates) {
    const n = asNumber(raw, -1);
    if (n >= 0) return Math.round(n);
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

class SaveCoordinator {
  constructor() {
    this.pipelines = new Map();
    this.sessionQueues = new Map();
    this.debounceTimers = new Map();
    this.debouncePayloads = new Map();
    this.debouncePromises = new Map();
    this.subscribers = new Set();
    this.pipelineStatus = new Map();
  }

  /**
   * Register a pipeline configuration.
   *
   * @param {string} name
   * @param {Object} config
   * @param {Function} config.transport - (sessionId, payload) => Promise<response>
   * @param {Function} [config.buildPayload] - (payload, sessionId) => request payload
   * @param {Function} [config.getBaseVersion] - (sessionId) => number | null
   * @param {Function} [config.onSuccess] - (response, sessionId) => void
   * @param {Function} [config.on409] - (response, sessionId) => void
   * @param {Function} [config.onError] - (errorOrResponse, sessionId) => void
   * @param {number} [config.debounceMs]
   * @param {number} [config.retryCount]
   * @param {number} [config.retryDelayMs]
   * @param {number} [config.transportTimeoutMs] - max time a single transport call may hang (default 10000)
   * @param {number} [config.maxRetryDelayMs] - cap for exponential backoff (default 4000)
   */
  registerPipeline(name, config = {}) {
    const pipelineName = asText(name);
    if (!pipelineName) {
      throw new Error("saveCoordinator.registerPipeline: name is required");
    }
    if (typeof config.transport !== "function") {
      throw new Error(`saveCoordinator.registerPipeline("${pipelineName}"): transport is required`);
    }
    this.pipelines.set(pipelineName, {
      buildPayload: typeof config.buildPayload === "function" ? config.buildPayload : (payload) => payload,
      transport: config.transport,
      getBaseVersion: typeof config.getBaseVersion === "function" ? config.getBaseVersion : null,
      onSuccess: typeof config.onSuccess === "function" ? config.onSuccess : null,
      on409: typeof config.on409 === "function" ? config.on409 : null,
      onError: typeof config.onError === "function" ? config.onError : null,
      debounceMs: Math.max(0, asNumber(config.debounceMs, 300)),
      retryCount: Math.max(0, asNumber(config.retryCount, 3)),
      retryDelayMs: Math.max(0, asNumber(config.retryDelayMs, 1000)),
      transportTimeoutMs: Math.max(50, asNumber(config.transportTimeoutMs, 10000)),
      maxRetryDelayMs: Math.max(0, asNumber(config.maxRetryDelayMs, 4000)),
    });
  }

  subscribe(callback) {
    if (typeof callback !== "function") return () => {};
    this.subscribers.add(callback);
    return () => this.unsubscribe(callback);
  }

  unsubscribe(callback) {
    this.subscribers.delete(callback);
  }

  emit(event, data) {
    for (const callback of this.subscribers) {
      try {
        callback(event, data);
      } catch {
        // Subscriber errors must not break the coordinator.
      }
    }
  }

  _setPipelineStatus(pipelineName, sessionId, state, detail = {}) {
    const status = {
      pipeline: pipelineName,
      sessionId: asText(sessionId),
      state,
      timestamp: Date.now(),
      ...detail,
    };
    this.pipelineStatus.set(pipelineName, status);
    this.emit("status", status);
  }

  _runTransportWithTimeout(pipelineName, pipeline, sessionId, payload) {
    const timeoutMs = Math.max(1000, asNumber(pipeline.transportTimeoutMs, 10000));
    const transportPromise = pipeline.transport(sessionId, payload);
    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`saveCoordinator: pipeline "${pipelineName}" transport timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      // Ensure timer doesn't keep Node process alive in tests.
      if (timer && typeof timer.unref === "function") timer.unref();
    });
    return Promise.race([transportPromise, timeoutPromise]);
  }

  getStatus(name) {
    return this.pipelineStatus.get(asText(name)) || {
      pipeline: asText(name),
      sessionId: "",
      state: "idle",
      timestamp: 0,
    };
  }

  getGlobalStatus() {
    const statuses = Array.from(this.pipelineStatus.values());
    const busy = statuses.some((s) => s.state === "busy");
    const pending = this.debounceTimers.size > 0;
    return {
      busy,
      pending,
      hasUnsavedChanges: this.hasUnsavedChanges(),
      pipelines: statuses,
    };
  }

  hasUnsavedChanges() {
    return this.sessionQueues.size > 0 || this.debounceTimers.size > 0;
  }

  /**
   * Cancel pending debounces and drop queued (but not yet running) saves for a
   * session. Used when closing a session or resetting state in tests.
   */
  clearSession(sessionId) {
    const sid = asText(sessionId);
    if (!sid) {
      for (const timer of this.debounceTimers.values()) {
        clearTimeout(timer);
      }
      this.debounceTimers.clear();
      this.debouncePayloads.clear();
      for (const deferred of this.debouncePromises.values()) {
        try {
          deferred.reject(new Error("saveCoordinator cleared"));
        } catch {
          // no-op
        }
      }
      this.debouncePromises.clear();
      this.sessionQueues.clear();
      return;
    }

    const suffix = `::${sid}`;
    for (const [key, wrapped] of this.sessionQueues.entries()) {
      if (key === sid || key.endsWith(suffix)) {
        this.sessionQueues.delete(key);
      }
    }
    for (const [key, timer] of this.debounceTimers.entries()) {
      if (key.endsWith(`::${sid}`)) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
        this.debouncePayloads.delete(key);
        const deferred = this.debouncePromises.get(key);
        this.debouncePromises.delete(key);
        if (deferred) {
          try {
            deferred.reject(new Error("saveCoordinator cleared"));
          } catch {
            // no-op
          }
        }
      }
    }
  }

  _scheduleDebounced(pipelineName, pipeline, sessionId, payload) {
    const key = debounceKey(pipelineName, sessionId);
    this.debouncePayloads.set(key, { sessionId, payload });
    this._setPipelineStatus(pipelineName, sessionId, "pending", { debounceMs: pipeline.debounceMs });

    let deferred = this.debouncePromises.get(key);
    if (!deferred) {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      deferred = { promise, resolve, reject };
      this.debouncePromises.set(key, deferred);
    }

    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.debouncePromises.delete(key);
      const pending = this.debouncePayloads.get(key);
      this.debouncePayloads.delete(key);
      if (pending) {
        this._enqueueRun(pipelineName, pending.sessionId, pending.payload)
          .then((result) => deferred.resolve(result), (error) => deferred.reject(error));
      } else {
        deferred.resolve(undefined);
      }
    }, pipeline.debounceMs);

    this.debounceTimers.set(key, timer);

    return deferred.promise;
  }

  async _runPipeline(pipelineName, sessionId, payload) {
    const pipeline = this.pipelines.get(pipelineName);
    if (!pipeline) {
      throw new Error(`saveCoordinator: unknown pipeline "${pipelineName}"`);
    }

    const sid = asText(sessionId);
    if (!sid) {
      throw new Error(`saveCoordinator: sessionId is required for pipeline "${pipelineName}"`);
    }

    this._setPipelineStatus(pipelineName, sid, "busy", { stage: "build" });

    let builtPayload = pipeline.buildPayload(payload, sid);
    if (!builtPayload || typeof builtPayload !== "object") {
      builtPayload = {};
    }

    if (pipeline.getBaseVersion) {
      const baseVersion = pipeline.getBaseVersion(sid, payload);
      if (baseVersion !== null && baseVersion !== undefined) {
        builtPayload.base_diagram_state_version = Math.round(asNumber(baseVersion, -1));
      }
    }

    let lastResult = null;
    let lastError = null;

    for (let attempt = 0; attempt <= pipeline.retryCount; attempt += 1) {
      this._setPipelineStatus(pipelineName, sid, "busy", { stage: "transport", attempt });

      try {
        lastResult = await this._runTransportWithTimeout(pipelineName, pipeline, sid, builtPayload);
        lastError = null;
      } catch (error) {
        lastError = error;
        lastResult = null;
      }

      const result = lastError ? { ok: false, status: 0, error: String(lastError?.message || lastError) } : lastResult;

      if (!result?.ok) {
        if (isConflictResponse(result)) {
          this._setPipelineStatus(pipelineName, sid, "busy", { stage: "409" });
          rollbackTrackedDiagramStateVersion(sid);
          const serverVersion = pickServerCurrentVersion(result);
          if (serverVersion !== null) {
            setTrackedDiagramStateVersion(sid, serverVersion);
          }
          if (pipeline.on409) {
            try {
              pipeline.on409(result, sid, payload);
            } catch {
              // no-op
            }
          }
          this._setPipelineStatus(pipelineName, sid, "idle", { outcome: "conflict" });
          this.emit("conflict", { pipeline: pipelineName, sessionId: sid, response: result });
          return result;
        }

        const isTimeoutError = lastError && /timeout/i.test(String(lastError?.message || lastError));
        if (attempt < pipeline.retryCount && !isTimeoutError) {
          const delay = Math.min(pipeline.maxRetryDelayMs, pipeline.retryDelayMs * 2 ** attempt);
          this._setPipelineStatus(pipelineName, sid, "busy", { stage: "retry", attempt, delayMs: delay });
          await sleep(delay);
          continue;
        }

        rollbackTrackedDiagramStateVersion(sid);
        if (pipeline.onError) {
          try {
            pipeline.onError(result, sid, payload);
          } catch {
            // no-op
          }
        }
        this._setPipelineStatus(pipelineName, sid, "idle", { outcome: "error" });
        this.emit("error", { pipeline: pipelineName, sessionId: sid, response: result });
        return result;
      }

      // Success path.
      const newVersion = pickDiagramStateVersion(result);
      if (newVersion !== null) {
        bumpTrackedDiagramStateVersion(sid, newVersion);
      }
      if (pipeline.onSuccess) {
        try {
          pipeline.onSuccess(result, sid, payload);
        } catch {
          // no-op
        }
      }
      this._setPipelineStatus(pipelineName, sid, "idle", { outcome: "success" });
      this.emit("success", { pipeline: pipelineName, sessionId: sid, response: result });
      return result;
    }

    // Unreachable, but keeps linters happy.
    return lastResult || { ok: false, status: 0, error: "unreachable" };
  }

  _enqueueRun(pipelineName, sessionId, payload) {
    const sid = asText(sessionId);
    const qKey = queueKey(pipelineName, sid);
    const previous = this.sessionQueues.get(qKey) || Promise.resolve();

    const run = previous.catch(() => null).then(() => this._runPipeline(pipelineName, sid, payload));

    const wrapped = run.finally(() => {
      if (this.sessionQueues.get(qKey) === wrapped) {
        this.sessionQueues.delete(qKey);
      }
    });

    this.sessionQueues.set(qKey, wrapped);
    return run;
  }

  /**
   * Execute a single pipeline for a session.
   *
   * @param {string} name
   * @param {Object} payload - must include `sessionId`
   * @returns {Promise<Object>}
   */
  execute(name, payload = {}) {
    const pipelineName = asText(name);
    const pipeline = this.pipelines.get(pipelineName);
    if (!pipeline) {
      return Promise.reject(new Error(`saveCoordinator: unknown pipeline "${pipelineName}"`));
    }

    const sessionId = asText(payload?.sessionId);
    if (!sessionId) {
      return Promise.reject(new Error(`saveCoordinator: payload.sessionId is required for pipeline "${pipelineName}"`));
    }

    if (pipeline.debounceMs > 0) {
      return this._scheduleDebounced(pipelineName, pipeline, sessionId, payload);
    }

    return this._enqueueRun(pipelineName, sessionId, payload);
  }

  /**
   * Execute multiple pipelines sequentially for the same session.
   *
   * @param {string[]} names
   * @param {Object<string, Object>} payloadMap - maps pipeline name to payload
   * @returns {Promise<Object[]>} - results in the same order as names
   */
  async executeBatch(names, payloadMap = {}) {
    const results = [];
    for (const name of names) {
      const payload = payloadMap?.[name] || {};
      const result = await this.execute(name, payload);
      results.push(result);
    }
    return results;
  }
}

export function createSaveCoordinator() {
  return new SaveCoordinator();
}

/**
 * Singleton coordinator used by production code.
 */
export const saveCoordinator = createSaveCoordinator();

export default saveCoordinator;
