import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, X, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
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

interface SelectedProject {
  id: string;
  name: string;
  cattleType: string;
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
  const [lastContactPickerOpen, setLastContactPickerOpen] = useState(false);

  const count = selectedProjects.length;

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

  const handleLastContactChange = async (date: Date) => {
    setBusy(true);
    const dateStr = format(date, "yyyy-MM-dd");
    const { data: { user } } = await supabase.auth.getUser();
    const failed: string[] = [];
    for (const p of selectedProjects) {
      const { error } = await supabase.from("projects").update({
        last_contacted_date: dateStr,
        last_contacted_by: user?.id ?? null,
      }).eq("id", p.id);
      if (error) failed.push(p.name);
    }
    setBusy(false);
    showResult("Last contact date updated", failed);
    onComplete();
  };

  const handleDelete = async () => {
    setBusy(true);
    const failed: string[] = [];
    for (const p of selectedProjects) {
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

  const handleBulkExport = async (type: "csv" | "pdf") => {
    setBusy(true);
    try {
      const ids = selectedProjects.map((p) => p.id);

      const [pRes, eRes, bRes] = await Promise.all([
        supabase.from("projects").select("*").in("id", ids),
        supabase.from("protocol_events").select("*").in("project_id", ids).order("event_date", { ascending: true }),
        supabase.from("project_bulls").select("*, bulls_catalog(bull_name, company, registration_number)").in("project_id", ids),
      ]);

      const projectsData = (pRes.data ?? []) as any[];
      const orderedProjects = ids.map((id) => projectsData.find((p: any) => p.id === id)).filter(Boolean);

      const eventsByProject: Record<string, any[]> = {};
      for (const ev of (eRes.data ?? []) as any[]) {
        if (!eventsByProject[ev.project_id]) eventsByProject[ev.project_id] = [];
        eventsByProject[ev.project_id].push(ev);
      }

      const bullsByProject: Record<string, any[]> = {};
      for (const b of (bRes.data ?? []) as any[]) {
        if (!bullsByProject[b.project_id]) bullsByProject[b.project_id] = [];
        bullsByProject[b.project_id].push(b);
      }

      if (type === "csv") {
        generateBulkCsv(orderedProjects, eventsByProject, bullsByProject, ids);
      } else {
        generateBulkPdf(orderedProjects, eventsByProject, bullsByProject, ids);
      }

      toast({
        title: `Exported ${ids.length} project${ids.length > 1 ? "s" : ""} as ${type.toUpperCase()}`,
      });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
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

        <Popover open={lastContactPickerOpen} onOpenChange={setLastContactPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" disabled={busy}>
              <CalendarIcon className="h-3 w-3" /> Last Contact
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              onSelect={(d) => { if (d) { handleLastContactChange(d); setLastContactPickerOpen(false); } }}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={busy}
          onClick={() => handleBulkExport("csv")}
        >
          <Download className="h-3 w-3" /> Export CSV
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={busy}
          onClick={() => handleBulkExport("pdf")}
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
