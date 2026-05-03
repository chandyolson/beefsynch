import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Building2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import BackButton from "@/components/BackButton";
import AppFooter from "@/components/AppFooter";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CompanyRow {
  id: string;
  name: string;
  active: boolean;
  can_own_inventory: boolean;
  is_internal: boolean;
  is_placeholder: boolean;
  created_at: string;
}

interface UsageCounts {
  orders: number;
  shipments: number;
  offerings: number;
}

const Companies = () => {
  const { orgId } = useOrgRole();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Add/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<CompanyRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["semen_companies_all", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("semen_companies")
        .select("id, name, active, can_own_inventory, is_internal, is_placeholder, created_at")
        .eq("organization_id", orgId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
  });

  // Bulk usage counts: one query per usage source, grouped client-side
  const { data: usage = {} as Record<string, UsageCounts> } = useQuery({
    queryKey: ["semen_companies_usage", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [ordersRes, shipmentsRes, offeringsRes] = await Promise.all([
        (supabase as any)
          .from("semen_orders")
          .select("semen_company_id")
          .eq("organization_id", orgId)
          .not("semen_company_id", "is", null),
        (supabase as any)
          .from("shipments")
          .select("semen_company_id")
          .eq("organization_id", orgId)
          .not("semen_company_id", "is", null),
        (supabase as any)
          .from("bull_company_offerings")
          .select("company_id")
          .eq("organization_id", orgId),
      ]);

      const map: Record<string, UsageCounts> = {};
      const bump = (id: string, key: keyof UsageCounts) => {
        if (!map[id]) map[id] = { orders: 0, shipments: 0, offerings: 0 };
        map[id][key]++;
      };
      (ordersRes.data ?? []).forEach((r: any) =>
        r.semen_company_id && bump(r.semen_company_id, "orders"),
      );
      (shipmentsRes.data ?? []).forEach((r: any) =>
        r.semen_company_id && bump(r.semen_company_id, "shipments"),
      );
      (offeringsRes.data ?? []).forEach((r: any) =>
        r.company_id && bump(r.company_id, "offerings"),
      );
      return map;
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (!showInactive && !c.active) return false;
      if (s && !c.name.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [companies, search, showInactive]);

  const openAdd = () => {
    setEditingId(null);
    setFormName("");
    setDialogOpen(true);
  };

  const openEdit = (row: CompanyRow) => {
    setEditingId(row.id);
    setFormName(row.name);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!orgId) return;
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await (supabase as any)
          .from("semen_companies")
          .update({ name })
          .eq("id", editingId);
        if (error) throw error;
        toast({ title: "Company updated" });
      } else {
        const { error } = await (supabase as any)
          .from("semen_companies")
          .insert({ name, organization_id: orgId });
        if (error) throw error;
        toast({ title: "Company added" });
      }
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["semen_companies_all"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: CompanyRow) => {
    try {
      const { error } = await (supabase as any)
        .from("semen_companies")
        .update({ active: !row.active })
        .eq("id", row.id);
      if (error) throw error;
      toast({ title: row.active ? "Deactivated" : "Reactivated" });
      queryClient.invalidateQueries({ queryKey: ["semen_companies_all"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await (supabase as any)
        .from("semen_companies")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "Company deleted" });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["semen_companies_all"] });
      queryClient.invalidateQueries({ queryKey: ["semen_companies_usage"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const totalUsage = (id: string) => {
    const u = usage[id];
    if (!u) return 0;
    return u.orders + u.shipments + u.offerings;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto px-4 py-6 w-full">
        <BackButton />

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              Semen Companies
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage suppliers used in orders and shipments.
            </p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Company
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies…"
              className="pl-9"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Show inactive
          </label>
        </div>

        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Shipments</TableHead>
                <TableHead className="text-right">Bulls Offered</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    No companies match your filters.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((row) => {
                const u = usage[row.id] || { orders: 0, shipments: 0, offerings: 0 };
                const inUse = totalUsage(row.id) > 0;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.active
                            ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {row.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{u.orders}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.shipments}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.offerings}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleActive(row)}
                        >
                          {row.active ? "Deactivate" : "Reactivate"}
                        </Button>
                        {inUse ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button size="sm" variant="outline" disabled>
                                    Delete
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Deactivate instead — in use by {totalUsage(row.id)} record
                                {totalUsage(row.id) !== 1 ? "s" : ""}.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(row)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </main>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Rename Company" : "Add Company"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the supplier name."
                : "Add a new semen supplier to your organization."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[100px_1fr] items-center gap-x-4 gap-y-3">
            <Label className="text-right">Name *</Label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. ABS"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save Changes" : "Add Company"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the company. It is not used in any orders,
              shipments, or bull offerings — so this is safe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AppFooter />
    </div>
  );
};

export default Companies;
