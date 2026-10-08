import { useQuery } from '@tanstack/react-query';
import { fetchSuites, fetchCases } from '../api/qase';
import type { QaseSuite } from '../types/qase';

const BATCH = 100;

async function fetchAllSuites(token: string, projectCode: string): Promise<QaseSuite[]> {
  const first = await fetchSuites(token, projectCode, BATCH, 0);
  const total = first.result.total;
  const all = [...first.result.entities];
  if (total > BATCH) {
    const pages = Math.ceil((total - BATCH) / BATCH);
    const rest = await Promise.all(
      Array.from({ length: pages }, (_, i) =>
        fetchSuites(token, projectCode, BATCH, (i + 1) * BATCH).then((r) => r.result.entities),
      ),
    );
    all.push(...rest.flat());
  }
  return all;
}

async function fetchAllCasesSuiteIds(
  token: string,
  projectCode: string,
  total: number,
): Promise<Array<{ id: number; suite_id: number | null }>> {
  const all: Array<{ id: number; suite_id: number | null }> = [];
  const first = await fetchCases(token, projectCode, BATCH, 0);
  all.push(...first.result.entities.map((c) => ({ id: c.id, suite_id: c.suite_id })));
  const actualTotal = first.result.total;
  if (actualTotal > BATCH) {
    const pages = Math.ceil((actualTotal - BATCH) / BATCH);
    const rest = await Promise.all(
      Array.from({ length: pages }, (_, i) =>
        fetchCases(token, projectCode, BATCH, (i + 1) * BATCH).then((r) =>
          r.result.entities.map((c) => ({ id: c.id, suite_id: c.suite_id })),
        ),
      ),
    );
    all.push(...rest.flat());
  }
  return all;
}

/**
 * Returns a Map<caseId, suiteTitle> for the project.
 * Uses the full suite hierarchy (parent › child › grandchild).
 */
export function useProjectCaseMap(
  token: string,
  projectCode: string,
  totalCases: number,
  enabled: boolean,
) {
  return useQuery<Map<number, string>>({
    queryKey: ['qase', 'case-suite-map', token, projectCode],
    queryFn: async () => {
      const [suites, cases] = await Promise.all([
        fetchAllSuites(token, projectCode),
        fetchAllCasesSuiteIds(token, projectCode, totalCases),
      ]);

      // Build suite id → full path title (leaf title only for readability)
      const suiteMap = new Map<number, string>(suites.map((s) => [s.id, s.title]));

      // Build case → suite title map
      const caseMap = new Map<number, string>();
      for (const c of cases) {
        if (c.suite_id != null) {
          const title = suiteMap.get(c.suite_id);
          if (title) caseMap.set(c.id, title);
        }
      }
      return caseMap;
    },
    staleTime: 10 * 60 * 1000,
    enabled: enabled && !!token && !!projectCode && totalCases > 0,
    placeholderData: (prev) => prev,
  });
}
