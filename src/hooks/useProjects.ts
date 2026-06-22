import { useQuery } from '@tanstack/react-query';
import { fetchProjects } from '../api/qase';

export function useProjects() {
  return useQuery({
    queryKey: ['qase', 'projects'],
    queryFn: () => fetchProjects(),
    staleTime: 5 * 60 * 1000,
  });
}
