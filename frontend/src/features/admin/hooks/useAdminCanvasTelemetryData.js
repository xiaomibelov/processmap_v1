import { useMemo } from "react";

import useAdminDataQuery from "./useAdminDataQuery";
import {
  getAdminCanvasTelemetryContext,
  getAdminCanvasTelemetryErrors,
} from "../api/adminCanvasTelemetryApi";
import { buildCanvasTelemetryParams } from "../utils/adminCanvasTelemetryQuery";
import { toText } from "../adminUtils";

export function useAdminCanvasTelemetryErrorsData({
  enabled = true,
  filters = {},
} = {}) {
  const params = useMemo(() => buildCanvasTelemetryParams(filters), [filters]);
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);
  return useAdminDataQuery({
    enabled,
    initialData: { ok: true, items: [], page: { limit: 50, offset: 0, total: 0 } },
    deps: [paramsKey],
    fetcher: () => getAdminCanvasTelemetryErrors(params),
  });
}

export function useAdminCanvasTelemetryContextData({
  enabled = true,
  groupId = "",
} = {}) {
  const id = toText(groupId);
  return useAdminDataQuery({
    enabled: Boolean(enabled && id),
    initialData: null,
    deps: [id],
    fetcher: () => getAdminCanvasTelemetryContext(id),
  });
}

export default {
  useAdminCanvasTelemetryErrorsData,
  useAdminCanvasTelemetryContextData,
};
