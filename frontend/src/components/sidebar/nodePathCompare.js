import {
  normalizePathSequenceKey,
  normalizePathTierList,
} from "../../features/process/pathClassification.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeNodePathTagList(value) {
  return normalizePathTierList(asArray(value));
}

function normalizeSequenceKey(value) {
  return normalizePathSequenceKey(value);
}

export function deriveNodePathCompareSummary({
  localPaths = [],
  sharedPaths = [],
  localSequenceKey = "",
  sharedSequenceKey = "",
} = {}) {
  const normalizedLocalPaths = normalizeNodePathTagList(localPaths);
  const normalizedSharedPaths = normalizeNodePathTagList(sharedPaths);
  const sharedSet = new Set(normalizedSharedPaths);
  const localSet = new Set(normalizedLocalPaths);
  const commonPaths = normalizedLocalPaths.filter((tag) => sharedSet.has(tag));
  const localOnlyPaths = normalizedLocalPaths.filter((tag) => !sharedSet.has(tag));
  const sharedOnlyPaths = normalizedSharedPaths.filter((tag) => !localSet.has(tag));
  const normalizedLocalSequence = normalizeSequenceKey(localSequenceKey);
  const normalizedSharedSequence = normalizeSequenceKey(sharedSequenceKey);
  const sequenceDiffers = normalizedLocalSequence !== normalizedSharedSequence;
  return {
    localPaths: normalizedLocalPaths,
    sharedPaths: normalizedSharedPaths,
    commonPaths,
    localOnlyPaths,
    sharedOnlyPaths,
    localSequenceKey: normalizedLocalSequence,
    sharedSequenceKey: normalizedSharedSequence,
    sequenceDiffers,
    hasDifferences: localOnlyPaths.length > 0 || sharedOnlyPaths.length > 0 || sequenceDiffers,
  };
}
