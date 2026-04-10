import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Package, Users, Truck, PackagePlus, Droplets, ShoppingCart, Plus,
  Layers, ScrollText
} from "lucide-react";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import NewProjectDialog from "@/components/NewProjectDialog";
import InventoryTab from "@/components/inventory/InventoryTab";
import OrdersTab from "@/components/inventory/OrdersTab";
import PackingTab from "@/components/inventory/PackingTab";
import TanksTabContent from "@/components/inventory/TanksTabContent";
import LogTab from "@/components/inventory/LogTab";
import ReceivingTab from "@/components/inventory/ReceivingTab";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { useQuery } from "@tanstack/react-query";

const PAGE_SIZE = 1000;

async function fetchAllUnits(baseQuery: any): Promise<number> {
  let total = 0;
  let from = 0;
  while (true) {
    const { data, error } = await baseQuery.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) total += (row.units ?? 0);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return total;
}

const TABS = [
  { key: "inventory", label: "Inventory", icon: Layers, desc: "This tab will show your semen inventory with filters and exports." },
  { key: "orders", label: "Orders", icon: ShoppingCart, desc: "This tab will show semen orders with fulfillment and billing status." },
  { key: "receiving", label: "Receiving", icon: Truck, desc: "This tab will show received shipments with packing slip attachments." },
  { key: "packing", label: "Packing", icon: PackagePlus, desc: "This tab will show pack and unpack history." },
  { key: "tanks", label: "Tanks", icon: Package, desc: "This tab will show all tanks with fill status and locations." },
  { key: "log", label: "Log", icon: ScrollText, desc: "This tab will show the full inventory transaction ledger." },
] as const;

type TabKey = typeof TABS[number]["key"];

const QUICK_ACTIONS = [
  { label: "Receive Shipment", icon: Truck, path: "/receive-shipment" },
  { label: "Pack Tank", icon: PackagePlus, path: "/pack-tank" },
  { label: "Fill Tank", icon: Droplets, path: "/tanks-dashboard" },
  { label: "New Order", icon: ShoppingCart, path: "/semen-orders" },
  { label: "New Project", icon: Plus, path: "/dashboard" },
];

const InventoryHub = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { orgId, orgName, userId } = useOrgRole();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inventoryOwnerFilter, setInventoryOwnerFilter] = useState<"all" | "company" | "customer">("all");

  const activeTab = (searchParams.get("tab") as TabKey) || "inventory";
  const setTab = (tab: TabKey) => setSearchParams({ tab }, { replace: true });

  const { data: companyUnits = 0 } = useQuery({
    queryKey: ["inv-hub-company", orgId],
    queryFn: async () => {
      if (!orgId) return 0;
      return fetchAllUnits(
        supabase.from("tank_inventory").select("units").eq("organization_id", orgId).is("customer_id", null)
      );
    },
    enabled: !!orgId,
  });

  const { data: customerUnits = 0 } = useQuery({
    queryKey: ["inv-hub-customer", orgId],
    queryFn: async () => {
      if (!orgId) return 0;
      return fetchAllUnits(
        supabase.from("tank_inventory").select("units").eq("organization_id", orgId).not("customer_id", "is", null)
      );
    },
    enabled: !!orgId,
  });

  const currentTab = useMemo(() => TABS.find(t => t.key === activeTab) || TABS[0], [activeTab]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--gradient-bg)" }}>
      <Navbar onNewProject={() => setDialogOpen(true)} />
      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} onProjectCreated={() => {}} />

      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {/* Page title */}
        <h1 className="text-2xl font-bold font-display text-foreground">Inventory Hub</h1>

        {/* Header cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Company inventory card */}
          <button
            onClick={() => { setInventoryOwnerFilter("company"); setTab("inventory"); }}
            className="relative overflow-hidden rounded-xl p-5 text-left cursor-pointer hover:brightness-110 transition-all"
            style={{
              background: "linear-gradient(135deg, #0d8a8a 0%, #1a5a8a 100%)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            }}
          >
            <Package className="absolute top-4 right-4 h-10 w-10 text-white/15" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
              Select Sires Inventory
            </p>
            <p className="text-3xl font-bold font-display text-white mt-1">
              {companyUnits.toLocaleString()} <span className="text-base font-normal text-white/70">units</span>
            </p>
          </button>

          {/* Customer inventory card */}
          <button
            onClick={() => { setInventoryOwnerFilter("customer"); setTab("inventory"); }}
            className="relative overflow-hidden rounded-xl p-5 text-left cursor-pointer hover:brightness-110 transition-all"
            style={{
              background: "linear-gradient(135deg, #b45309 0%, #d97706 100%)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            }}
          >
            <Users className="absolute top-4 right-4 h-10 w-10 text-white/15" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
              Customer Inventory
            </p>
            <p className="text-3xl font-bold font-display text-white mt-1">
              {customerUnits.toLocaleString()} <span className="text-base font-normal text-white/70">units</span>
            </p>
          </button>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <action.icon className="h-4 w-4" />
              {action.label}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="rounded-xl border border-border/40 bg-card/40 p-4">
          {activeTab === "inventory" && orgId && (
            <InventoryTab orgId={orgId} initialOwnerFilter={inventoryOwnerFilter} onFilterReset={() => setInventoryOwnerFilter("all")} />
          )}
          {activeTab === "orders" && orgId && <OrdersTab orgId={orgId} />}
          {activeTab === "receiving" && orgId && <ReceivingTab orgId={orgId} />}
          {activeTab === "packing" && orgId && <PackingTab orgId={orgId} />}
          {activeTab === "tanks" && orgId && <TanksTabContent orgId={orgId} orgName={orgName ?? null} userId={userId ?? null} />}
          {activeTab === "log" && orgId && <LogTab orgId={orgId} />}
        </div>
      </main>

      <AppFooter />
    </div>
  );
};

export default InventoryHub;
