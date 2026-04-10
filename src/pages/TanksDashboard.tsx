import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import TanksTabContent from "@/components/inventory/TanksTabContent";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { cn } from "@/lib/utils";

type TabKey = "customers" | "tanks" | "fills" | "out";

const TanksDashboard = () => {
  const { orgId, orgName, userId } = useOrgRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabKey) || "customers";

  const setTab = (tab: TabKey) => setSearchParams({ tab });

  const { data: customerCount = 0 } = useQuery({
    queryKey: ["customer_count", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", orgId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const { data: tankCount = 0 } = useQuery({
    queryKey: ["tank_count", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase.from("tanks").select("id", { count: "exact", head: true }).eq("organization_id", orgId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const { data: outCount = 0 } = useQuery({
    queryKey: ["tank_out_count", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase.from("tanks").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).eq("status", "out");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "customers", label: "Customers", count: customerCount },
    { key: "tanks", label: "Tanks", count: tankCount },
    { key: "fills", label: "Fills" },
    { key: "out", label: "Out", count: outCount },
  ];

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight">Tank Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {customerCount} customers · {tankCount} tanks
          </p>
        </div>

        {/* Tab buttons */}
        <div className="flex border border-border rounded-lg overflow-hidden w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={cn(
                "px-5 py-2.5 text-sm font-medium transition-colors flex items-center gap-2",
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center",
                  activeTab === tab.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {orgId && <TanksTabContent orgId={orgId} orgName={orgName ?? null} userId={userId ?? null} />}
      </main>
      <AppFooter />
    </div>
  );
};

export default TanksDashboard;
