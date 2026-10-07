import { useQuery } from '@tanstack/react-query';

export interface JiraIssueInfo {
  summary: string;
  type: string;
  status: string;
}

const CHUNK = 50;

async function fetchChunk(keys: string[]): Promise<Record<string, JiraIssueInfo>> {
  const res = await fetch(`/api/jira/issues?keys=${encodeURIComponent(keys.join(','))}`);
  if (!res.ok) throw new Error(`Jira lookup failed (${res.status})`);
  const data = (await res.json()) as { issues: Record<string, JiraIssueInfo> };
  return data.issues;
}

export function useJiraIssues(keys: string[]) {
  const sorted = [...new Set(keys)].sort();
  return useQuery<Record<string, JiraIssueInfo>>({
    queryKey: ['jira', 'issues', sorted.join(',')],
    queryFn: async () => {
      const chunks: string[][] = [];
      for (let i = 0; i < sorted.length; i += CHUNK) chunks.push(sorted.slice(i, i + CHUNK));
      const parts = await Promise.all(chunks.map(fetchChunk));
      return Object.assign({}, ...parts);
    },
    staleTime: 10 * 60 * 1000,
    enabled: sorted.length > 0,
    retry: false,
  });
}
