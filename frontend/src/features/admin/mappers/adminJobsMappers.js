import { asArray, asObject, toInt, toText } from "../utils/adminFormat";

export function mapAdminJobsPayload(payload = {}) {
  const src = asObject(payload);
  return {
    ...src,
    summary: {
      ...asObject(src.summary),
      total: toInt(src?.summary?.total, 0),
    },
    items: asArray(src.items).map((row) => ({
      ...asObject(row),
      job_id: toText(row?.job_id),
      status: toText(row?.status || "unknown"),
      retries: toInt(row?.retries, 0),
    })),
  };
}

