import { useQuery } from '@tanstack/react-query';
import { fetchMilestones } from '../api/qase';
import type { QaseMilestone } from '../types/qase';

const BATCH = 100;

export function useAllMilestones(token: string, projectCode: string, enabled: boolean) {
  return useQuery<QaseMilestone[]>({
    queryKey: ['qase', 'milestones', token, projectCode],
    queryFn: async () => {
      const first = await fetchMilestones(token, projectCode, BATCH, 0);
      const total = first.result.total;
      const all = [...first.result.entities];
      if (total > BATCH) {
        const pages = Math.ceil((total - BATCH) / BATCH);
        const rest = await Promise.all(
          Array.from({ length: pages }, (_, i) =>
            fetchMilestones(token, projectCode, BATCH, (i + 1) * BATCH).then(
              (r) => r.result.entities,
            ),
          ),
        );
        all.push(...rest.flat());
      }
      return all;
    },
    staleTime: 10 * 60 * 1000,
    enabled: enabled && !!token && !!projectCode,
    placeholderData: (prev) => prev,
  });
}
