import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCallback, useMemo } from "react";

const QUERY_KEY = ["bull_favorites"];

export function useBullFavorites() {
  const queryClient = useQueryClient();

  const { data: favData = [] } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("bull_favorites")
        .select("bull_catalog_id")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []).map((f) => f.bull_catalog_id).filter(Boolean) as string[];
    },
  });

  const favoritedIds = useMemo(() => new Set(favData), [favData]);

  const toggleFavorite = useCallback(async (bullCatalogId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const isFav = favoritedIds.has(bullCatalogId);

    // Optimistic update
    queryClient.setQueryData<string[]>(QUERY_KEY, (old = []) =>
      isFav ? old.filter((id) => id !== bullCatalogId) : [...old, bullCatalogId]
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = isFav
      ? await supabase
          .from("bull_favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("bull_catalog_id", bullCatalogId)
      : await supabase
          .from("bull_favorites")
          .insert({ user_id: user.id, bull_catalog_id: bullCatalogId });

    if (error) {
      // Revert
      queryClient.setQueryData<string[]>(QUERY_KEY, (old = []) =>
        isFav ? [...old, bullCatalogId] : old.filter((id) => id !== bullCatalogId)
      );
      toast({ title: "Could not save favorite — please try again.", variant: "destructive" });
    }
  }, [favoritedIds, queryClient]);

  return { favoritedIds, toggleFavorite };
}
