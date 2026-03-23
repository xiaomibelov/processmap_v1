function isFn(value) {
  return typeof value === "function";
}

export function areCamundaPropertiesSectionPropsEqual(prevPropsRaw, nextPropsRaw) {
  const prevProps = prevPropsRaw && typeof prevPropsRaw === "object" ? prevPropsRaw : {};
  const nextProps = nextPropsRaw && typeof nextPropsRaw === "object" ? nextPropsRaw : {};
  const keys = new Set([
    ...Object.keys(prevProps),
    ...Object.keys(nextProps),
  ]);

  for (const key of keys) {
    const prevValue = prevProps[key];
    const nextValue = nextProps[key];

    if (isFn(prevValue) || isFn(nextValue)) {
      continue;
    }

    if (!Object.is(prevValue, nextValue)) {
      return false;
    }
  }

  return true;
}
