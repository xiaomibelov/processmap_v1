import { asArray, asObject, toInt, toText } from "../utils/adminFormat";

export function mapAdminAuditPayload(payload = {}) {
  const src = asObject(payload);
  return {
    ...src,
    summary: {
      ...asObject(src.summary),
      total: toInt(src?.summary?.total, 0),
    },
    items: asArray(src.items).map((row) => ({
      ...asObject(row),
      id: toText(row?.id),
      action: toText(row?.action),
      status: toText(row?.status || "unknown"),
    })),
  };
}

