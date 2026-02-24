import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OrgRole = "owner" | "admin" | "member" | null;

interface OrgRoleContextValue {
  role: OrgRole;
  orgId: string | null;
  userId: string | null;
  loading: boolean;
}

const OrgRoleContext = createContext<OrgRoleContextValue>({
  role: null,
  orgId: null,
  userId: null,
  loading: true,
});

export function OrgRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<OrgRole>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.is_anonymous) {
        setUserId(user?.id ?? null);
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const { data } = await supabase
        .from("organization_members")
        .select("role, organization_id")
        .eq("user_id", user.id)
        .eq("accepted", true)
        .limit(1)
        .maybeSingle();

      if (data) {
        setRole(data.role as OrgRole);
        setOrgId(data.organization_id);
      }
      setLoading(false);
    };

    fetchRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setLoading(true);
      fetchRole();
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <OrgRoleContext.Provider value={{ role, orgId, userId, loading }}>
      {children}
    </OrgRoleContext.Provider>
  );
}

export function useOrgRole() {
  return useContext(OrgRoleContext);
}
