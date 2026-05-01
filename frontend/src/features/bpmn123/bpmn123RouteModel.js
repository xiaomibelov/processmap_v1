export const BPMN123_ROUTE_ROOT = "/app/bpmn123";
export const BPMN123_LEVEL_ROUTE_PREFIX = `${BPMN123_ROUTE_ROOT}/level/`;
export const BPMN123_DEFAULT_LEVEL_ID = "bpmn1-level1-first-process";

function normalizePathname(rawPathname) {
  const src = String(rawPathname || "").trim();
  if (!src) return "/";
  const withoutHash = src.split("#")[0] || "/";
  const withoutQuery = withoutHash.split("?")[0] || "/";
  if (!withoutQuery.startsWith("/")) return "/";
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.replace(/\/+$/, "");
  }
  return withoutQuery;
}

function readLevelId(pathname) {
  const encoded = pathname.slice(BPMN123_LEVEL_ROUTE_PREFIX.length).split("/")[0] || "";
  try {
    return decodeURIComponent(encoded).trim();
  } catch {
    return encoded.trim();
  }
}

export function resolveBpmn123Route(rawPathname) {
  const pathname = normalizePathname(rawPathname);
  if (pathname === BPMN123_ROUTE_ROOT) {
    return {
      isBpmn123Route: true,
      isDefaultAlias: true,
      levelId: BPMN123_DEFAULT_LEVEL_ID,
    };
  }

  if (pathname.startsWith(BPMN123_LEVEL_ROUTE_PREFIX)) {
    const levelId = readLevelId(pathname);
    if (!levelId) {
      return {
        isBpmn123Route: true,
        isDefaultAlias: false,
        levelId: BPMN123_DEFAULT_LEVEL_ID,
      };
    }
    return {
      isBpmn123Route: true,
      isDefaultAlias: false,
      levelId,
    };
  }

  return {
    isBpmn123Route: false,
    isDefaultAlias: false,
    levelId: "",
  };
}
