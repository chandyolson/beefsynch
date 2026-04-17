import { useNavigate, useSearchParams } from "react-router-dom";
import { Package, ClipboardList } from "lucide-react";

import Navbar from "@/components/Navbar";
import BackButton from "@/components/BackButton";
import AppFooter from "@/components/AppFooter";
import { useOrgRole } from "@/hooks/useOrgRole";
import { useSupabaseCount } from "@/hooks/useSupabaseCount";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import InventoryTab from "@/components/inventory/InventoryTab";
import OrdersTab from "@/components/inventory/OrdersTab";

type TabKey = "inventory" | "orders";

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: "inventory", label: "Inventory" },
  { key: "orders", label: "Orders" },
];

const InventoryDashboard = () => {
  const { orgId } = useOrgRole();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabKey) || "inventory";

  const setTab = (tab: TabKey) => setSearchParams({ tab }, { replace: true });

  // Badge counts
  const { data: inventoryCount = 0 } = useSupabaseCount(
    ["inv_dash_inv_count", orgId],
    "tank_inventory",
    (query) => query.eq("organization_id", orgId!),
    !!orgId
  );

  const { data: orderCount = 0 } = useSupabaseCount(
    ["inv_dash_order_count", orgId],
    "semen_orders",
    (query) => query.eq("organization_id", orgId!),
    !!orgId
  );

  const badgeCounts: Record<TabKey, string> = {
    inventory: inventoryCount.toLocaleString(),
    orders: orderCount.toLocaleString(),
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-8">
        <BackButton />
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight">Semen Inventory Management</h2>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <Badge variant="secondary" className="font-normal">{inventoryCount.toLocaleString()} inventory rows</Badge>
            <Badge variant="secondary" className="font-normal">{orderCount} orders</Badge>
          </div>
        </div>

        {/* Tabs + Receive button */}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => navigate("/receive-shipment")} variant="outline" size="sm">
            <Package className="h-4 w-4 mr-2" />
            Receive Shipment
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/inventory-log")} className="gap-1.5">
            <ClipboardList className="h-4 w-4" /> Transaction Log
          </Button>
          {TAB_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                activeTab === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
              )}
            >
              {label}
              {badgeCounts[key] && (
                <span className={cn(
                  "ml-2 text-xs px-1.5 py-0.5 rounded-full",
                  activeTab === key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {badgeCounts[key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {orgId && activeTab === "inventory" && <InventoryTab orgId={orgId} />}
        {orgId && activeTab === "orders" && <OrdersTab orgId={orgId} />}
        
      </main>
      <AppFooter />
    </div>
  );
};

export default InventoryDashboard;
