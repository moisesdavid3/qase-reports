import { useQuery } from '@tanstack/react-query';
import { fetchDefects } from '../api/qase';
import type { QaseDefect } from '../types/qase';

const BATCH = 100;

export function useAllDefects(token: string, projectCode: string, enabled: boolean) {
  return useQuery<QaseDefect[]>({
    queryKey: ['qase', 'defects-all', token, projectCode],
    queryFn: async () => {
      const first = await fetchDefects(token, projectCode, BATCH, 0);
      const all = [...first.result.entities];
      const total = first.result.total;
      if (total > BATCH) {
        const pages = Math.ceil((total - BATCH) / BATCH);
        const rest = await Promise.all(
          Array.from({ length: pages }, (_, i) =>
            fetchDefects(token, projectCode, BATCH, (i + 1) * BATCH).then((r) => r.result.entities),
          ),
        );
        all.push(...rest.flat());
      }
      return all;
    },
    staleTime: 10 * 60 * 1000,
    enabled: enabled && !!token && !!projectCode,
  });
}
