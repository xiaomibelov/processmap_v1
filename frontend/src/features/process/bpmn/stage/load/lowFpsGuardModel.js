export const LOW_FPS_ENTER_THRESHOLD = 10;
export const LOW_FPS_EXIT_THRESHOLD = 15;
export const LOW_FPS_REQUIRED_SAMPLES = 2;

export function createLowFpsGuardState() {
  return { active: false, lowSamples: 0, recoverySamples: 0 };
}

export function reduceLowFpsGuardState(stateRaw, fpsRaw, options = {}) {
  const state = stateRaw || createLowFpsGuardState();
  if (options.sampleReady === false) return state;
  const fps = Number(fpsRaw);
  if (!Number.isFinite(fps) || fps < 0) return state;

  if (!state.active) {
    const lowSamples = fps < LOW_FPS_ENTER_THRESHOLD ? state.lowSamples + 1 : 0;
    return {
      active: lowSamples >= LOW_FPS_REQUIRED_SAMPLES,
      lowSamples,
      recoverySamples: 0,
    };
  }

  const recoverySamples = fps >= LOW_FPS_EXIT_THRESHOLD ? state.recoverySamples + 1 : 0;
  if (recoverySamples >= LOW_FPS_REQUIRED_SAMPLES) {
    return createLowFpsGuardState();
  }
  return { active: true, lowSamples: state.lowSamples, recoverySamples };
}
