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
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date Received</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Bulls</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead>Confirmed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredConfirmed.map((row: any) => {
                        const stats = getSnapshotStats(row.reconciliation_snapshot);
                        const so = (row.semen_orders as any);
                        const orderName = so?.customers?.name || (so?.order_type === "inventory" ? (so?.placed_by ? `Inventory — ${so.placed_by}` : "Inventory Order") : null);
                        return (
                          <TableRow
                            key={row.id}
                            className="cursor-pointer hover:bg-secondary/40"
                            onClick={() => navigate(`/receive-shipment/preview/${row.id}`)}
                          >
                            <TableCell>{row.received_date ? format(new Date(row.received_date + "T00:00:00"), "MMM d, yyyy") : "—"}</TableCell>
                            <TableCell>{row.semen_companies?.name || "—"}</TableCell>
                            <TableCell>{orderName || "—"}</TableCell>
                            <TableCell className="max-w-[300px] truncate text-sm">{getSnapshotBulls(row.reconciliation_snapshot)}</TableCell>
                            <TableCell className="text-right">{stats.units}</TableCell>
                            <TableCell className="text-sm">
                              {row.confirmed_at ? format(new Date(row.confirmed_at), "MMM d, yyyy h:mm a") : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
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
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date Created</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Bulls</TableHead>
                        <TableHead>Last Edited</TableHead>
                        
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDrafts.map((row: any) => {
                        const stats = getSnapshotStats(row.reconciliation_snapshot);
                        const so = (row.semen_orders as any);
                        const orderName = so?.customers?.name || (so?.order_type === "inventory" ? (so?.placed_by ? `Inventory — ${so.placed_by}` : "Inventory Order") : null);
                        const lastEdited = row.updated_at || row.created_at;
                        return (
                          <TableRow
                            key={row.id}
                            className="cursor-pointer hover:bg-secondary/40"
                            onClick={() => navigate(`/receive-shipment/preview/${row.id}`)}
                          >
                            <TableCell>{row.created_at ? format(new Date(row.created_at), "MMM d, yyyy h:mm a") : "—"}</TableCell>
                            <TableCell>{row.semen_companies?.name || "—"}</TableCell>
                            <TableCell>{orderName || "—"}</TableCell>
                            <TableCell className="max-w-[300px] truncate text-sm">{getSnapshotBulls(row.reconciliation_snapshot)}</TableCell>
                            <TableCell>{lastEdited ? format(new Date(lastEdited), "MMM d, yyyy h:mm a") : "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
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
