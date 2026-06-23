import { useQuery } from '@tanstack/react-query';
import { fetchProjects } from '../api/qase';

export function useProjects(token: string) {
  return useQuery({
    queryKey: ['qase', 'projects', token],
    queryFn: () => fetchProjects(token),
    staleTime: 5 * 60 * 1000,
    enabled: !!token,
  });
}
