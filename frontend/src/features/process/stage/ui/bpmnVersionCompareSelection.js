export function createInitialState() {
  return { previewId: null, compareAId: null, compareBId: null };
}

const SLOT_KEY = { A: "compareAId", B: "compareBId" };

export function reduce(state, action) {
  switch (action?.type) {
    case "preview":
      return { ...state, previewId: action.id ?? null };
    case "assign": {
      const { slot, id } = action;
      const selfKey = SLOT_KEY[slot];
      if (!selfKey) return state;
      const otherKey = slot === "A" ? SLOT_KEY.B : SLOT_KEY.A;
      if (state[selfKey] === id) {
        return { ...state, [selfKey]: null };
      }
      if (state[otherKey] === id) {
        return { ...state, [selfKey]: state[otherKey], [otherKey]: state[selfKey] };
      }
      return { ...state, [selfKey]: id };
    }
    case "clear": {
      const selfKey = SLOT_KEY[action.slot];
      if (!selfKey) return state;
      return { ...state, [selfKey]: null };
    }
    case "reset":
      return createInitialState();
    default:
      return state;
  }
}

export function selectMode(state) {
  if (state.compareAId && state.compareBId) return "compare";
  if (state.previewId) return "single";
  return null;
}
