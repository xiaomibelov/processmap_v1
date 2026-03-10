export function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

export function lastItems(arr, n) {
  const a = safeArray(arr);
  const rev = a.slice().reverse();
  return rev.slice(0, n);
}
