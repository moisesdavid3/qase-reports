import { useQueries } from '@tanstack/react-query';
import { fetchRuns } from '../api/qase';
import type { QaseProject } from '../types/qase';

// Runs come back oldest-first, so the last run is the one at offset total - 1.
export function useLastRunDates(token: string, projects: QaseProject[]): { dates: Record<string, number | null>; ready: boolean } {
  const results = useQueries({
    queries: projects.map((p) => ({
      queryKey: ['qase', 'last-run', token, p.code, p.counts.runs.total],
      queryFn: async () => {
        const res = await fetchRuns(token, p.code, 1, p.counts.runs.total - 1);
        const run = res.result.entities[0];
        const t = run ? new Date(run.start_time ?? run.end_time ?? 0).getTime() : NaN;
        return isNaN(t) || t === 0 ? null : t;
      },
      staleTime: 5 * 60 * 1000,
      enabled: !!token && p.counts.runs.total > 0,
    })),
  });
  const out: Record<string, number | null> = {};
  projects.forEach((p, i) => { out[p.code] = results[i].data ?? null; });
  const ready = projects.every((p, i) => p.counts.runs.total === 0 || !results[i].isPending);
  return { dates: out, ready };
}
