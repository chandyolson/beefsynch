import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSupabaseCount(
  queryKey: string[],
  table: string,
  filters?: (query: any) => any,
  enabled?: boolean
) {
  return useQuery({
    queryKey,
    enabled: enabled ?? true,
    queryFn: async () => {
      let query: any = supabase.from(table as any).select("id", { count: "exact", head: true });

      // Apply filters if provided
      if (filters) {
        query = filters(query);
      }

      const { count, error } = await query;

      if (error) throw error;

      return count ?? 0;
    },
  });
}
