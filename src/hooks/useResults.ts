import { useQuery } from '@tanstack/react-query';
import { fetchResults } from '../api/qase';
import type { QaseResult, QaseRun } from '../types/qase';

const BATCH = 100;
const MAX_PER_RUN = 500;

export function usePeriodResults(
  token: string,
  projectCode: string,
  runs: QaseRun[],
  enabled: boolean,
) {
  const runKey = runs.map((r) => r.id).join(',');
  return useQuery<QaseResult[]>({
    queryKey: ['qase', 'period-results', token, projectCode, runKey],
    queryFn: async () => {
      const allResults: QaseResult[] = [];
      await Promise.all(
        runs.map(async (run) => {
          const cap = Math.min(run.stats.total, MAX_PER_RUN);
          if (cap === 0) return;
          const batches: Promise<QaseResult[]>[] = [];
          for (let offset = 0; offset < cap; offset += BATCH) {
            batches.push(
              fetchResults(token, projectCode, run.id, BATCH, offset).then(
                (r) => r.result.entities,
              ),
            );
          }
          const results = (await Promise.all(batches)).flat();
          allResults.push(...results);
        }),
      );
      return allResults;
    },
    staleTime: 10 * 60 * 1000,
    enabled: enabled && !!token && !!projectCode && runs.length > 0,
    placeholderData: (prev) => prev,
  });
}
