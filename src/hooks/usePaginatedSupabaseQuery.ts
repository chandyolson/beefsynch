import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PaginatedQueryOptions {
  queryKey: string[];
  table: string;
  select?: string;
  filters?: (query: any) => any; // function that applies .eq(), .in(), etc.
  orderBy?: { column: string; ascending?: boolean };
  pageSize?: number;
  enabled?: boolean;
}

export function usePaginatedSupabaseQuery<T = any>(options: PaginatedQueryOptions) {
  const { queryKey, table, select = "*", filters, orderBy, pageSize = 1000, enabled = true } = options;

  return useQuery({
    queryKey,
    enabled,
    queryFn: async () => {
      const allRows: T[] = [];
      let from = 0;

      while (true) {
        let query: any = supabase.from(table as any).select(select);

        // Apply filters if provided
        if (filters) {
          query = filters(query);
        }

        // Apply ordering if provided
        if (orderBy) {
          query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
        }

        // Fetch the current page
        const { data, error } = await query.range(from, from + pageSize - 1);

        if (error) throw error;

        const rows = (data ?? []) as T[];
        allRows.push(...rows);

        // Stop if we got fewer rows than pageSize (last page)
        if (rows.length < pageSize) break;

        from += pageSize;
      }

      return allRows;
    },
  });
}
