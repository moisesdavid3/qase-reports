import { useQuery } from '@tanstack/react-query';
import { fetchRuns } from '../api/qase';
import type { QaseRun } from '../types/qase';

export const PAGE_SIZE = 20;

export function useRunsTotal(token: string, projectCode: string, search: string) {
  return useQuery({
    queryKey: ['qase', 'runs-total', token, projectCode, search],
    queryFn: () => fetchRuns(token, projectCode, 1, 0, search),
    staleTime: 5 * 60 * 1000,
    enabled: !!token && !!projectCode,
  });
}

// Without client filter: reverse-paginate server-side (newest first, 20 per page).
export function useRuns(token: string, projectCode: string, page: number, search: string, total: number) {
  const offset = Math.max(0, total - page * PAGE_SIZE);
  return useQuery({
    queryKey: ['qase', 'runs', token, projectCode, page, search, total],
    queryFn: () => fetchRuns(token, projectCode, PAGE_SIZE, offset, search),
    staleTime: 5 * 60 * 1000,
    enabled: !!token && !!projectCode && total > 0,
    placeholderData: (prev) => prev,
  });
}

// With client filter: fetch ALL runs (up to 500) in parallel batches so we can filter client-side.
const BATCH = 100;
const MAX_RUNS = 500;

export function useAllRuns(
  token: string,
  projectCode: string,
  search: string,
  total: number,
  enabled: boolean,
) {
  const count = Math.min(total, MAX_RUNS);
  const startOffset = Math.max(0, total - count);

  return useQuery<QaseRun[]>({
    queryKey: ['qase', 'runs-all', token, projectCode, search, total],
    queryFn: async () => {
      const requests: Promise<QaseRun[]>[] = [];
      for (let off = startOffset; off < total; off += BATCH) {
        const limit = Math.min(BATCH, total - off);
        requests.push(
          fetchRuns(token, projectCode, limit, off, search).then((r) => r.result.entities),
        );
      }
      const batches = await Promise.all(requests);
      return batches.flat();
    },
    staleTime: 5 * 60 * 1000,
    enabled: enabled && !!token && !!projectCode && total > 0,
    placeholderData: (prev) => prev,
  });
}
