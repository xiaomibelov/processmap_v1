import { useQuery } from "@tanstack/react-query";

/**
 * Admin wrapper around TanStack Query `useQuery`.
 *
 * @param {object} options
 * @param {Array} options.queryKey - TanStack Query key.
 * @param {Function} options.fetcher - Async function returning `{ ok, data, error }`.
 * @param {boolean} [options.enabled=true]
 * @param {Function} [options.select] - Optional selector for `data`.
 * @returns {object} `{ data, isLoading, isError, error, refetch, isFetching }`
 */
export function useAdminQuery({ queryKey, fetcher, enabled = true, select }) {
  return useQuery({
    queryKey,
    queryFn: fetcher,
    enabled,
    select,
  });
}
