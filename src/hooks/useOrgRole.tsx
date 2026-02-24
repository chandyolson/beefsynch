import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OrgRole = "owner" | "admin" | "member" | null;

export interface UserOrg {
  orgId: string;
  orgName: string;
  role: OrgRole;
}

interface OrgRoleContextValue {
  role: OrgRole;
  orgId: string | null;
  orgName: string | null;
  userId: string | null;
  loading: boolean;
  userOrgs: UserOrg[];
  switchOrg: (orgId: string) => void;
}

const OrgRoleContext = createContext<OrgRoleContextValue>({
  role: null,
  orgId: null,
  orgName: null,
  userId: null,
  loading: true,
  userOrgs: [],
  switchOrg: () => {},
});

export function OrgRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<OrgRole>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userOrgs, setUserOrgs] = useState<UserOrg[]>([]);

  const switchOrg = (newOrgId: string) => {
    const org = userOrgs.find((o) => o.orgId === newOrgId);
    if (org) {
      setOrgId(org.orgId);
      setOrgName(org.orgName);
      setRole(org.role);
    }
  };

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
        .select("role, organization_id, organizations(name)")
        .eq("user_id", user.id)
        .eq("accepted", true);

      if (data && data.length > 0) {
        const orgs: UserOrg[] = data.map((d: any) => ({
          orgId: d.organization_id,
          orgName: d.organizations?.name ?? "Unknown",
          role: d.role as OrgRole,
        }));
        setUserOrgs(orgs);
        // Use first org as default (or keep current if still valid)
        const current = orgs.find((o) => o.orgId === orgId) ?? orgs[0];
        setRole(current.role);
        setOrgId(current.orgId);
        setOrgName(current.orgName);
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
    <OrgRoleContext.Provider value={{ role, orgId, orgName, userId, loading, userOrgs, switchOrg }}>
      {children}
    </OrgRoleContext.Provider>
  );
}

export function useOrgRole() {
  return useContext(OrgRoleContext);
}
