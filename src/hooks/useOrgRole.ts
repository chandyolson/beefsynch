import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OrgRole = "owner" | "admin" | "member" | null;

export function useOrgRole() {
  const [role, setRole] = useState<OrgRole>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || user.is_anonymous) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("organization_members")
        .select("role, organization_id")
        .eq("user_id", user.id)
        .eq("accepted", true)
        .limit(1)
        .single();

      if (data) {
        setRole(data.role as OrgRole);
        setOrgId(data.organization_id);
      }
      setLoading(false);
    });
  }, []);

  return { role, orgId, loading };
}
