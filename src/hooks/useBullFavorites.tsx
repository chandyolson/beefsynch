import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCallback, useMemo, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const QUERY_KEY = ["bull_favorites"];

export function useBullFavorites() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isAnonymous, setIsAnonymous] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAnonymous(!!user?.is_anonymous);
    });
  }, []);

  const { data: favData = [] } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.is_anonymous) return [];
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

    if (isAnonymous) {
      toast({
        title: "Create a free account to save favorite bulls across sessions.",
        action: (
          <button
            onClick={() => navigate("/auth")}
            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Create Account
          </button>
        ),
      });
      return;
    }

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
  }, [favoritedIds, queryClient, isAnonymous, navigate]);

  return { favoritedIds, toggleFavorite };
}
