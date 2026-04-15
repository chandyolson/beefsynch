import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, Clock, RotateCcw } from "lucide-react";
import { format, parseISO, differenceInDays, startOfMonth } from "date-fns";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import BackButton from "@/components/BackButton";
import StatCard from "@/components/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";

const TYPE_BADGE: Record<string, string> = {
  customer_tank: "bg-teal-600/20 text-teal-400 border-teal-600/30",
  inventory_tank: "bg-purple-600/20 text-purple-400 border-purple-600/30",
  shipper: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  mushroom: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  rental_tank: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  communal_tank: "bg-orange-600/20 text-orange-400 border-orange-600/30",
  freeze_branding: "bg-muted text-muted-foreground border-border",
};
const TYPE_LABELS: Record<string, string> = {
  customer_tank: "Customer Tank", inventory_tank: "Inventory Tank", shipper: "Shipper",
  mushroom: "Mushroom", rental_tank: "Rental Tank", communal_tank: "Communal Tank", freeze_branding: "Freeze Branding",
};

const TanksOut = () => {
  const { orgId, userId } = useOrgRole();
  const queryClient = useQueryClient();

  // Return dialog
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnTankId, setReturnTankId] = useState<string | null>(null);
  const [returnDate, setReturnDate] = useState<Date>(new Date());
  const [returnStatus, setReturnStatus] = useState("wet");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnSaving, setReturnSaving] = useState(false);

  // Fetch tanks with status = 'out'
  const { data: outTanks = [], isLoading } = useQuery({
    queryKey: ["tanks_out", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tanks")
        .select("*, customers(name)")
        .eq("organization_id", orgId!)
        .eq("location_status", "out")
        .order("tank_number");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fetch movements for out tanks to find when they went out
  const outTankIds = useMemo(() => outTanks.map((t: any) => t.id), [outTanks]);

  const { data: movements = [] } = useQuery({
    queryKey: ["out_tank_movements", outTankIds],
    enabled: outTankIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_movements")
        .select("tank_id, movement_date, movement_type, notes, customers(name)")
        .in("tank_id", outTankIds)
        .in("movement_type", ["picked_up", "shipped_out"])
        .order("movement_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fetch returns this month
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const { data: returnsThisMonth = [] } = useQuery({
    queryKey: ["returns_this_month", orgId, monthStart],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_movements")
        .select("id")
        .eq("organization_id", orgId!)
        .in("movement_type", ["returned", "received_back"])
        .gte("movement_date", monthStart);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Latest out movement per tank
  const lastOutMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of movements) {
      if (!map.has(m.tank_id)) map.set(m.tank_id, m);
    }
    return map;
  }, [movements]);

  // Enriched & sorted
  const enriched = useMemo(() => {
    return outTanks.map((t: any) => {
      const move = lastOutMap.get(t.id);
      const dateOut = move?.movement_date || null;
      const daysOut = dateOut ? differenceInDays(new Date(), parseISO(dateOut)) : null;
      const customerName = move?.customers?.name || t.customers?.name || null;
      return { ...t, dateOut, daysOut, moveNotes: move?.notes || null, customerName };
    }).sort((a: any, b: any) => (b.daysOut ?? 99999) - (a.daysOut ?? 99999));
  }, [outTanks, lastOutMap]);

  // Stats
  const currentlyOut = outTanks.length;
  const avgDaysOut = useMemo(() => {
    const vals = enriched.filter((t: any) => t.daysOut !== null).map((t: any) => t.daysOut as number);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }, [enriched]);
  const returnedCount = returnsThisMonth.length;

  // Record return
  const openReturn = (tankId: string) => {
    setReturnTankId(tankId);
    setReturnDate(new Date());
    setReturnStatus("wet");
    setReturnNotes("");
    setReturnOpen(true);
  };

  const handleReturn = async () => {
    if (!returnTankId || !orgId) return;
    setReturnSaving(true);
    const { error: moveErr } = await supabase.from("tank_movements").insert({
      organization_id: orgId,
      tank_id: returnTankId,
      movement_type: "returned",
      movement_date: format(returnDate, "yyyy-MM-dd"),
      tank_status_after: returnStatus,
      performed_by: userId,
      notes: returnNotes.trim() || null,
    } as any);
    if (moveErr) {
      setReturnSaving(false);
      toast({ title: "Error", description: "Could not record return.", variant: "destructive" });
      return;
    }
    await (supabase as any).from("tanks").update({ location_status: "here", nitrogen_status: returnStatus }).eq("id", returnTankId);
    setReturnSaving(false);
    queryClient.invalidateQueries({ queryKey: ["tanks_out"] });
    queryClient.invalidateQueries({ queryKey: ["returns_this_month"] });
    queryClient.invalidateQueries({ queryKey: ["all_tanks"] });
    toast({ title: "Return recorded" });
    setReturnOpen(false);
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-8">
        <BackButton />
        <h2 className="text-2xl font-bold font-display tracking-tight">Tanks Out</h2>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard title="Currently Out" value={currentlyOut} delay={0} index={0} icon={Truck} />
          <StatCard title="Avg Days Out" value={avgDaysOut} delay={100} index={1} icon={Clock} />
          <StatCard title="Returned This Month" value={returnedCount} delay={200} index={2} icon={RotateCcw} />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Tank Number</TableHead>
                <TableHead>Tank Name</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date Out</TableHead>
                <TableHead className="text-right">Days Out</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : enriched.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No tanks currently out.</TableCell></TableRow>
              ) : enriched.map((tank: any) => (
                <TableRow
                  key={tank.id}
                  className={cn(
                    "hover:bg-muted/20",
                    tank.daysOut !== null && tank.daysOut > 60 && "bg-destructive/5",
                    tank.daysOut !== null && tank.daysOut > 30 && tank.daysOut <= 60 && "bg-amber-500/5",
                  )}
                >
                  <TableCell className="font-medium whitespace-nowrap">{tank.tank_number}</TableCell>
                  <TableCell className="whitespace-nowrap">{tank.tank_name || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{tank.customerName || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={TYPE_BADGE[tank.tank_type] || "bg-muted text-muted-foreground border-border"}>
                      {TYPE_LABELS[tank.tank_type] || tank.tank_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {tank.dateOut ? format(parseISO(tank.dateOut), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell className={cn(
                    "text-right font-medium",
                    tank.daysOut !== null && tank.daysOut > 60 && "text-destructive",
                    tank.daysOut !== null && tank.daysOut > 30 && tank.daysOut <= 60 && "text-orange-400",
                  )}>
                    {tank.daysOut ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{tank.moveNotes || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openReturn(tank.id)} className="gap-1.5">
                      <RotateCcw className="h-3.5 w-3.5" /> Return
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </main>

      {/* Return Dialog */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Return</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Return Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(returnDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={returnDate} onSelect={(d) => d && setReturnDate(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Status After</Label>
              <Select value={returnStatus} onValueChange={setReturnStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wet">Wet</SelectItem>
                  <SelectItem value="dry">Dry</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button>
              <Button onClick={handleReturn} disabled={returnSaving}>{returnSaving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AppFooter />
    </div>
  );
};

export default TanksOut;
