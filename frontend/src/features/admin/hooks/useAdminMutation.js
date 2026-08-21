import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Admin wrapper around TanStack Query `useMutation`.
 * Automatically invalidates the supplied query keys on success.
 *
 * @param {object} options
 * @param {Function} options.mutationFn - Async function performing the mutation.
 * @param {Array<Array>} [options.invalidateKeys=[]] - Query keys to invalidate on success.
 * @param {Function} [options.onSuccess] - Extra success handler.
 * @param {Function} [options.onError] - Error handler.
 * @returns {object} TanStack `useMutation` result.
 */
export function useAdminMutation({ mutationFn, invalidateKeys = [], onSuccess, onError }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data, variables, context) => {
      invalidateKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      onSuccess?.(data, variables, context);
    },
    onError,
  });
}
