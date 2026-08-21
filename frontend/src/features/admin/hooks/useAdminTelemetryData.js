import { useMemo } from "react";

import useAdminDataQuery from "./useAdminDataQuery";
import { getAdminTelemetryErrorEvent, getAdminTelemetryErrorEvents } from "../api/adminTelemetryApi";
import { buildTelemetryErrorEventsParams } from "../utils/adminTelemetryQuery";
import { toText } from "../adminUtils";

export function useAdminTelemetryErrorEventsData({
  enabled = true,
  filters = {},
} = {}) {
  const params = useMemo(() => buildTelemetryErrorEventsParams(filters), [filters]);
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);
  return useAdminDataQuery({
    enabled,
    initialData: { ok: true, items: [], count: 0, page: { limit: 50, offset: 0, total: 0, order: "asc" } },
    deps: [paramsKey],
    fetcher: () => getAdminTelemetryErrorEvents(params),
  });
}

export function useAdminTelemetryErrorEventDetailData({
  enabled = true,
  eventId = "",
} = {}) {
  const id = toText(eventId);
  return useAdminDataQuery({
    enabled: Boolean(enabled && id),
    initialData: null,
    deps: [id],
    fetcher: () => getAdminTelemetryErrorEvent(id),
  });
}

export default {
  useAdminTelemetryErrorEventsData,
  useAdminTelemetryErrorEventDetailData,
};
