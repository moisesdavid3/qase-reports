import { useQuery } from '@tanstack/react-query';
import { fetchUsers } from '../api/qase';

export function useUsers(token: string) {
  return useQuery({
    queryKey: ['qase', 'users', token],
    queryFn: () => fetchUsers(token),
    staleTime: 10 * 60 * 1000,
    enabled: !!token,
  });
}
