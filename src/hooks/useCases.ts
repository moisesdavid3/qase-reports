import { useQuery } from '@tanstack/react-query';
import { fetchCases } from '../api/qase';
import type { QaseCase } from '../types/qase';

const BATCH = 100;

export function useAllCases(token: string, projectCode: string, total: number, enabled: boolean) {
  return useQuery<QaseCase[]>({
    queryKey: ['qase', 'cases-all', token, projectCode, total],
    queryFn: async () => {
      const requests: Promise<QaseCase[]>[] = [];
      for (let offset = 0; offset < total; offset += BATCH) {
        requests.push(
          fetchCases(token, projectCode, BATCH, offset).then((r) => r.result.entities),
        );
      }
      const batches = await Promise.all(requests);
      return batches.flat();
    },
    staleTime: 10 * 60 * 1000,
    enabled: enabled && !!token && !!projectCode && total > 0,
    placeholderData: (prev) => prev,
  });
}

export function useCasesTotal(token: string, projectCode: string, enabled: boolean) {
  return useQuery({
    queryKey: ['qase', 'cases-total', token, projectCode],
    queryFn: () => fetchCases(token, projectCode, 1, 0),
    staleTime: 10 * 60 * 1000,
    enabled: enabled && !!token && !!projectCode,
  });
}
