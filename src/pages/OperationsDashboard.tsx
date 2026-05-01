import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Package, ShoppingCart,
  Layers, ScrollText, List, Users, LayoutDashboard,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import NewProjectDialog from "@/components/NewProjectDialog";

import HubTab from "@/components/operations/HubTab";
import ProjectsTab from "@/components/operations/ProjectsTab";
import InventoryTab from "@/components/inventory/InventoryTab";
import OrdersTab from "@/components/inventory/OrdersTab";

import TanksTabContent from "@/components/inventory/TanksTabContent";
import LogTab from "@/components/inventory/LogTab";

import { useOrgRole } from "@/hooks/useOrgRole";

interface TabDef {
  key: string;
  label: string;
  icon: any;
  href?: string;
}

const TABS: TabDef[] = [
  { key: "hub", label: "Hub", icon: LayoutDashboard },
  { key: "projects", label: "Projects", icon: List },
  { key: "inventory", label: "Inventory", icon: Layers },
  { key: "orders", label: "Orders", icon: ShoppingCart },
  { key: "customers", label: "Customers", icon: Users, href: "/customers" },
  { key: "tanks", label: "Tanks", icon: Package },
  { key: "log", label: "Log", icon: ScrollText },
];

type TabKey = string;

const OperationsDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { orgId, orgName, userId } = useOrgRole();
  const [dialogOpen, setDialogOpen] = useState(false);
  const activeTab = (searchParams.get("tab") as TabKey) || "hub";
  const inventoryOwnerFilter = (searchParams.get("owner") as "all" | "company" | "customer") || "company";

  const setTab = (tab: TabKey, extra?: Record<string, string>) => {
    setSearchParams({ tab, ...extra }, { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--gradient-bg)" }}>
      <Navbar onNewProject={() => setDialogOpen(true)} />
      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} onProjectCreated={() => {}} />

      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold font-display text-foreground">Operations Dashboard</h1>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                if (tab.href) {
                  navigate(tab.href);
                } else {
                  setTab(tab.key);
                }
              }}
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
          {activeTab === "hub" && orgId && (
            <HubTab orgId={orgId} onSwitchTab={(tab, extra) => setTab(tab as TabKey, extra)} />
          )}
          {activeTab === "projects" && orgId && (
            <ProjectsTab orgId={orgId} />
          )}
          {activeTab === "inventory" && orgId && (
            <InventoryTab orgId={orgId} initialOwnerFilter={inventoryOwnerFilter} onFilterReset={() => setSearchParams({ tab: "inventory" }, { replace: true })} />
          )}
          {activeTab === "orders" && orgId && (
            <OrdersTab orgId={orgId} />
          )}
          {activeTab === "packing" && orgId && (
            <PackingTab orgId={orgId} />
          )}
          {activeTab === "tanks" && orgId && (
            <TanksTabContent orgId={orgId} orgName={orgName ?? null} userId={userId ?? null} />
          )}
          {activeTab === "log" && orgId && <LogTab orgId={orgId} />}
        </div>
      </main>

      <AppFooter />
    </div>
  );
};

export default OperationsDashboard;
