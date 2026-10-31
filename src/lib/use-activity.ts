import { useQuery } from '@tanstack/react-query';

import { fetchActivity } from '@/lib/api';
import { getSeen } from '@/lib/activity';
import { useAuth } from '@/lib/auth';

export function useActivity() {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['activity', me],
    enabled: !!me,
    refetchInterval: 60_000,
    staleTime: 15_000,
    queryFn: async () => {
      const [feed, comments] = await Promise.all([getSeen('feed', me!), getSeen('comments', me!)]);
      return fetchActivity(me!, feed, comments);
    },
  });
}
