import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Debounce-free search state plus paging, shared by the list pages. */
export function useListParams(initial = {}) {
  const [params, setParams] = useState({ page: 1, limit: 25, ...initial });

  return {
    params,
    setPage: (page) => setParams((current) => ({ ...current, page })),
    setFilter: (key, value) =>
      setParams((current) => ({ ...current, [key]: value || undefined, page: 1 })),
  };
}

/**
 * Wraps a resource's list call in react-query and exposes create/update/delete
 * mutations that invalidate the list on success.
 */
export function useResource(key, resource, params) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [key, params],
    queryFn: () => resource.list(params),
    placeholderData: (previous) => previous,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [key] });

  const create = useMutation({ mutationFn: resource.create, onSuccess: invalidate });
  const update = useMutation({ mutationFn: resource.update, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: resource.remove, onSuccess: invalidate });

  return {
    rows: query.data?.data ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    create,
    update,
    remove,
    invalidate,
  };
}

/** Loads an entire reference list (products, materials…) for dropdowns. */
export function useOptions(key, resource, params = { limit: 200 }) {
  const query = useQuery({
    queryKey: [key, 'options', params],
    queryFn: () => resource.list(params),
    staleTime: 5 * 60 * 1000,
  });

  return useMemo(() => query.data?.data ?? [], [query.data]);
}
