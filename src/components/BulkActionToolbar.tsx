import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, X, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { calculateProtocolEvents } from "@/lib/protocolEvents";
import { generateBulkCsv } from "@/lib/generateBulkCsv";
import { generateBulkPdf } from "@/lib/generateBulkPdf";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
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

const cowProtocols = ["Select Synch CIDR", "Select Synch TOO", "Select Synch", "7&7 Synch"];
const heiferProtocols = ["7 Day CIDR", "7&7 Synch", "MGA", "14 Day CIDR"];
const allProtocols = [...new Set([...cowProtocols, ...heiferProtocols])];

interface SelectedProject {
  id: string;
  name: string;
  cattleType: string; // "Cows" or "Heifers" from DB cattle_type
  protocol: string;
  breedingTime: string | null;
}

interface BulkActionToolbarProps {
  selectedProjects: SelectedProject[];
  onClear: () => void;
  onComplete: () => void;
  canDelete?: boolean;
}

const BulkActionToolbar = ({ selectedProjects, onClear, onComplete, canDelete = true }: BulkActionToolbarProps) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const count = selectedProjects.length;

  // Determine cattle types among selected
  const cattleTypes = new Set(selectedProjects.map((p) => p.cattleType));
  const isMixed = cattleTypes.size > 1;
  const singleType = isMixed ? null : [...cattleTypes][0];
  const protocolOptions = isMixed
    ? allProtocols
    : singleType === "Cows"
    ? cowProtocols
    : heiferProtocols;

  const recalcEvents = async (projectId: string, protocol: string, cattleType: string, breedingDate: string, breedingTime: string) => {
    await supabase.from("protocol_events").delete().eq("project_id", projectId);
    const events = calculateProtocolEvents(
      protocol,
      cattleType as "Heifers" | "Cows",
      new Date(breedingDate + "T12:00:00"),
      breedingTime
    );
    if (events.length > 0) {
      await supabase.from("protocol_events").insert(
        events.map((e) => ({
          project_id: projectId,
          event_name: e.event_name,
          event_date: e.event_date,
          event_time: e.event_time,
        }))
      );
    }
  };

  // Map display labels to DB values
  const statusDisplayToDb: Record<string, string> = {
    Tentative: "Tentative",
    Confirmed: "Confirmed",
    Complete: "Complete",
  };

  const handleStatusChange = async (status: string) => {
    const dbStatus = statusDisplayToDb[status] || status;
    setBusy(true);
    const failed: string[] = [];
    for (const p of selectedProjects) {
      const { error } = await supabase.from("projects").update({ status: dbStatus }).eq("id", p.id);
      if (error) failed.push(p.name);
    }
    setBusy(false);
    showResult("Status updated", failed);
    onComplete();
  };

  const handleProtocolChange = async (protocol: string) => {
    setBusy(true);
    const failed: string[] = [];
    for (const p of selectedProjects) {
      const { error } = await supabase.from("projects").update({ protocol }).eq("id", p.id);
      if (error) { failed.push(p.name); continue; }
      // Fetch current project to get breeding_date/time
      const { data: proj } = await supabase.from("projects").select("breeding_date, breeding_time, cattle_type").eq("id", p.id).single();
      if (proj?.breeding_date) {
        try {
          await recalcEvents(p.id, protocol, proj.cattle_type, proj.breeding_date, proj.breeding_time || "10:00");
        } catch { failed.push(p.name); }
      }
    }
    setBusy(false);
    showResult("Protocol updated", failed);
    onComplete();
  };

  const handleDateChange = async (date: Date) => {
    setBusy(true);
    const dateStr = format(date, "yyyy-MM-dd");
    const failed: string[] = [];
    for (const p of selectedProjects) {
      const { error } = await supabase.from("projects").update({ breeding_date: dateStr }).eq("id", p.id);
      if (error) { failed.push(p.name); continue; }
      const { data: proj } = await supabase.from("projects").select("protocol, cattle_type, breeding_time").eq("id", p.id).single();
      if (proj) {
        try {
          await recalcEvents(p.id, proj.protocol, proj.cattle_type, dateStr, proj.breeding_time || "10:00");
        } catch { failed.push(p.name); }
      }
    }
    setBusy(false);
    showResult("Breeding date updated", failed);
    onComplete();
  };

  const handleTimeChange = async (time: string) => {
    if (!time) return;
    setBusy(true);
    const failed: string[] = [];
    for (const p of selectedProjects) {
      const { error } = await supabase.from("projects").update({ breeding_time: time }).eq("id", p.id);
      if (error) { failed.push(p.name); continue; }
      const { data: proj } = await supabase.from("projects").select("protocol, cattle_type, breeding_date").eq("id", p.id).single();
      if (proj?.breeding_date) {
        try {
          await recalcEvents(p.id, proj.protocol, proj.cattle_type, proj.breeding_date, time);
        } catch { failed.push(p.name); }
      }
    }
    setBusy(false);
    showResult("Breeding time updated", failed);
    onComplete();
  };

  const handleDelete = async () => {
    setBusy(true);
    const failed: string[] = [];
    for (const p of selectedProjects) {
      // Delete children first, then project
      await supabase.from("protocol_events").delete().eq("project_id", p.id);
      await supabase.from("project_bulls").delete().eq("project_id", p.id);
      const { error } = await supabase.from("projects").delete().eq("id", p.id);
      if (error) failed.push(p.name);
    }
    setBusy(false);
    setDeleteDialogOpen(false);
    showResult("Projects deleted", failed);
    onComplete();
  };

  const showResult = (action: string, failed: string[]) => {
    if (failed.length === 0) {
      toast({ title: action, description: `${count} project${count > 1 ? "s" : ""} updated successfully.` });
    } else {
      toast({
        title: `${action} — partial failure`,
        description: `Failed: ${failed.join(", ")}`,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <span className="text-sm font-medium text-foreground">
          {count} project{count > 1 ? "s" : ""} selected
        </span>

        <Select onValueChange={handleStatusChange} disabled={busy}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Change Status" />
          </SelectTrigger>
          <SelectContent>
            {["Tentative", "Confirmed", "Complete"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <Select onValueChange={handleProtocolChange} disabled={busy}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Change Protocol" />
            </SelectTrigger>
            <SelectContent>
              {isMixed && (
                <p className="px-2 py-1 text-xs text-warning">
                  Mixed cattle types — protocol will recalculate events
                </p>
              )}
              {protocolOptions.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" disabled={busy}>
              <CalendarIcon className="h-3 w-3" /> Change Date
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              onSelect={(d) => { if (d) { handleDateChange(d); setDatePickerOpen(false); } }}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-1">
          <Input
            type="time"
            className="h-8 w-[120px] text-xs"
            disabled={busy}
            onChange={(e) => handleTimeChange(e.target.value)}
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={busy}
          onClick={async () => {
            await handleBulkExport("csv");
          }}
        >
          <Download className="h-3 w-3" /> Export CSV
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={busy}
          onClick={async () => {
            await handleBulkExport("pdf");
          }}
        >
          <Download className="h-3 w-3" /> Export PDF
        </Button>

        {canDelete && (
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs"
            disabled={busy}
            onClick={() => setDeleteDialogOpen(true)}
          >
            Delete Selected
          </Button>
        )}

        <button
          onClick={onClear}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <X className="h-3 w-3" /> Cancel
        </button>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {count} project{count > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to delete {count} project{count > 1 ? "s" : ""}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default BulkActionToolbar;
