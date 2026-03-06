import { asArray, asObject, toText } from "../adminUtils";

export function hasItems(value) {
  return asArray(value).length > 0;
}

export function hasObjectKeys(value) {
  return Object.keys(asObject(value)).length > 0;
}

export function isTruthyStatus(value, expected = []) {
  const normalized = toText(value).toLowerCase();
  return expected.map((item) => toText(item).toLowerCase()).includes(normalized);
}

