import { asArray, asObject, toInt, toText } from "../utils/adminFormat";

export function mapAdminSessionsList(payload = {}) {
  const src = asObject(payload);
  return {
    ...src,
    items: asArray(src.items).map((row) => ({
      ...asObject(row),
      session_id: toText(row?.session_id),
      warnings_count: toInt(row?.warnings_count, 0),
      errors_count: toInt(row?.errors_count, 0),
    })),
  };
}

export function mapAdminSessionDetail(payload = {}) {
  const src = asObject(payload);
  const item = asObject(src.item);
  return {
    ...src,
    item: {
      ...item,
      session_id: toText(item.session_id),
      tabs: asObject(item.tabs),
    },
  };
}

