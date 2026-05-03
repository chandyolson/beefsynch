import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Search, X, FileText } from "lucide-react";
import { format } from "date-fns";

const ReceivingTab = ({ orgId }: { orgId: string }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useOrgRole();
  const queryClient = useQueryClient();

  const orderFilter = searchParams.get("order");
  const [activeTab, setActiveTab] = useState<string>(orderFilter ? "confirmed" : "confirmed");
  const [search, setSearch] = useState("");

  // Fetch confirmed shipments
  const { data: confirmed = [], isLoading: loadingConfirmed } = useQuery({
    queryKey: ["shipments", "confirmed", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("shipments")
        .select("id, received_date, semen_order_id, semen_company_id, semen_companies!shipments_semen_company_id_fkey(name), status, confirmed_at, confirmed_by, reconciliation_snapshot, created_at, semen_orders!shipments_semen_order_id_fkey(id, customers!semen_orders_customer_id_fkey(name))")
        .eq("organization_id", orgId)
        .eq("status", "confirmed")
        .order("received_date", { ascending: false })
        .range(0, 999);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  // Fetch drafts
  const { data: drafts = [], isLoading: loadingDrafts } = useQuery({
    queryKey: ["shipments", "drafts", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("shipments")
        .select("id, received_date, semen_order_id, semen_company_id, semen_companies!shipments_semen_company_id_fkey(name), status, reconciliation_snapshot, created_at, updated_at, semen_orders!shipments_semen_order_id_fkey(id, customers!semen_orders_customer_id_fkey(name))")
        .eq("organization_id", orgId)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .range(0, 999);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  // Filter helpers
  const filteredConfirmed = useMemo(() => {
    let rows = confirmed;
    if (orderFilter) {
      rows = rows.filter((r: any) => r.semen_order_id === orderFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r: any) =>
        (r.semen_companies?.name || "").toLowerCase().includes(q) ||
        ((r.semen_orders as any)?.customers?.name || "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [confirmed, search, orderFilter]);

  const filteredDrafts = useMemo(() => {
    if (!search.trim()) return drafts;
    const q = search.toLowerCase();
    return drafts.filter((r: any) =>
      (r.semen_companies?.name || "").toLowerCase().includes(q) ||
      ((r.semen_orders as any)?.customers?.name || "").toLowerCase().includes(q)
    );
  }, [drafts, search]);

  const getSnapshotStats = (snapshot: any) => {
    if (!snapshot) return { lines: 0, units: 0 };
    const rows = snapshot.received_lines || snapshot.draft_lines || [];
    return {
      lines: rows.length,
      units: rows.reduce((s: number, r: any) => s + (r.units || 0), 0),
    };
  };

  const getSnapshotLines = (snapshot: any): any[] => {
    if (!snapshot) return [];
    return snapshot.received_lines || snapshot.draft_lines || [];
  };

  const clearOrderFilter = () => {
    searchParams.delete("order");
    setSearchParams(searchParams);
  };

  const orderFilterName = useMemo(() => {
    if (!orderFilter) return null;
    const match = confirmed.find((r: any) => r.semen_order_id === orderFilter);
    return (match as any)?.semen_orders?.customers?.name || "Unknown";
  }, [orderFilter, confirmed]);



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Shipments</h2>
          <p className="text-sm text-muted-foreground">Receiving history and drafts in progress</p>
        </div>
        <Button onClick={() => navigate("/receive-shipment")}>
          <Plus className="h-4 w-4 mr-2" /> Receive Shipment
        </Button>
      </div>

      {/* Order filter chip */}
      {orderFilter && orderFilterName && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-sm">
            <FileText className="h-3 w-3" />
            Filtered to order: {orderFilterName}
            <button onClick={clearOrderFilter} className="ml-1 hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="confirmed">Confirmed ({confirmed.length})</TabsTrigger>
          <TabsTrigger value="drafts">Drafts ({drafts.length})</TabsTrigger>
        </TabsList>

        {/* Search */}
        <div className="relative mt-4 mb-2 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company or customer..."
            className="pl-9"
          />
        </div>

        {/* Confirmed Tab */}
        <TabsContent value="confirmed">
          <Card>
            <CardContent className="p-0">
              {loadingConfirmed ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /> Loading shipments…
                </div>
              ) : filteredConfirmed.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search ? "No shipments match your search." : orderFilter ? "No confirmed shipments for this order." : "No confirmed shipments yet. Click '+ Receive Shipment' to get started."}
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {filteredConfirmed.map((row: any) => {
                    const lines = getSnapshotLines(row.reconciliation_snapshot);
                    const totalUnits = lines.reduce((s: number, r: any) => s + (r.units || 0), 0);
                    const so = (row.semen_orders as any);
                    const customerName = so?.customers?.name || null;
                    return (
                      <div
                        key={row.id}
                        className="rounded-lg border p-4 cursor-pointer hover:bg-secondary/40 transition-colors"
                        onClick={() => navigate(`/receive-shipment/preview/${row.id}`)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-semibold">{row.semen_companies?.name || "—"}</div>
                          <div className="text-sm text-muted-foreground">
                            {row.received_date ? format(new Date(row.received_date + "T00:00:00"), "MMM d, yyyy") : "—"}
                          </div>
                        </div>
                        {customerName && (
                          <div className="text-sm text-teal-500 mt-1">For: {customerName}</div>
                        )}
                        <div className="border-t mt-3 pt-3 space-y-1">
                          {lines.length === 0 ? (
                            <div className="text-sm text-muted-foreground">No bulls recorded</div>
                          ) : (
                            lines.map((l: any, i: number) => (
                              <div key={i} className="text-sm">
                                {l.bullName || "Unknown bull"} — {l.units || 0} units
                              </div>
                            ))
                          )}
                        </div>
                        <div className="border-t mt-3 pt-2 flex justify-end">
                          <span className="text-sm font-medium">Total: {totalUnits} units</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Drafts Tab */}
        <TabsContent value="drafts">
          <Card>
            <CardContent className="p-0">
              {loadingDrafts ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /> Loading drafts…
                </div>
              ) : filteredDrafts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search ? "No drafts match your search." : "No drafts in progress."}
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {filteredDrafts.map((row: any) => {
                    const lines = getSnapshotLines(row.reconciliation_snapshot);
                    const totalUnits = lines.reduce((s: number, r: any) => s + (r.units || 0), 0);
                    const so = (row.semen_orders as any);
                    const customerName = so?.customers?.name || null;
                    const lastEdited = row.updated_at || row.created_at;
                    return (
                      <div
                        key={row.id}
                        className="rounded-lg border border-dashed p-4 cursor-pointer hover:bg-secondary/40 transition-colors"
                        onClick={() => navigate(`/receive-shipment/preview/${row.id}`)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-semibold">{row.semen_companies?.name || "—"}</div>
                          <div className="text-sm text-muted-foreground">
                            {lastEdited ? format(new Date(lastEdited), "MMM d, yyyy h:mm a") : "—"}
                          </div>
                        </div>
                        {customerName && (
                          <div className="text-sm text-teal-500 mt-1">For: {customerName}</div>
                        )}
                        <div className="border-t mt-3 pt-3 space-y-1">
                          {lines.length === 0 ? (
                            <div className="text-sm text-muted-foreground">No bulls recorded</div>
                          ) : (
                            lines.map((l: any, i: number) => (
                              <div key={i} className="text-sm">
                                {l.bullName || "Unknown bull"} — {l.units || 0} units
                              </div>
                            ))
                          )}
                        </div>
                        <div className="border-t mt-3 pt-2 flex justify-end">
                          <span className="text-sm font-medium">Total: {totalUnits} units</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReceivingTab;
