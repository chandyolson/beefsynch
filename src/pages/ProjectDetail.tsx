import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Calendar, FileDown, Download, Pencil, MoreVertical } from "lucide-react";
import NewProjectDialog from "@/components/NewProjectDialog";
import { generateProjectPdf } from "@/lib/generateProjectPdf";
import { generateProjectCsv } from "@/lib/generateProjectCsv";
import { buildProjectIcsEvents, generateIcsFile, downloadIcsFile } from "@/lib/generateIcs";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, parseISO } from "date-fns";

interface ProjectRow {
  id: string;
  name: string;
  cattle_type: string;
  protocol: string;
  head_count: number;
  breeding_date: string | null;
  breeding_time: string | null;
  status: string;
  notes: string | null;
}

interface EventRow {
  id: string;
  event_name: string;
  event_date: string;
  event_time: string | null;
}

interface BullRow {
  id: string;
  units: number;
  custom_bull_name: string | null;
  bull_catalog_id: string | null;
  bulls_catalog: { bull_name: string; company: string; registration_number: string } | null;
}

const statusColor: Record<string, string> = {
  Tentative: "bg-warning/20 text-warning",
  Confirmed: "bg-primary/20 text-primary",
  Complete: "bg-success/20 text-success",
};

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [bulls, setBulls] = useState<BullRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const load = async () => {
    if (!id) return;
    const [pRes, eRes, bRes] = await Promise.all([
      supabase.from("projects").select("*").eq("id", id).single(),
      supabase
        .from("protocol_events")
        .select("*")
        .eq("project_id", id)
        .order("event_date", { ascending: true }),
      supabase
        .from("project_bulls")
        .select("*, bulls_catalog(bull_name, company, registration_number)")
        .eq("project_id", id),
    ]);

    if (pRes.data) setProject(pRes.data as ProjectRow);
    if (eRes.data) setEvents(eRes.data as EventRow[]);
    if (bRes.data) setBulls(bRes.data as BullRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Project not found.
      </div>
    );
  }

  const noTimeEvents = ["Return Heat", "Estimated Calving"];

  const formatTime12 = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  const breedingDisplay = project.breeding_date
    ? format(parseISO(project.breeding_date), "MMMM d, yyyy")
    : "—";

  const breedingTimeDisplay = project.breeding_time
    ? formatTime12(project.breeding_time)
    : "";

  const calendarUrl = () => {
    if (!project.breeding_date) return "#";
    const dateStr = project.breeding_date.replace(/-/g, "");
    const title = encodeURIComponent(project.name);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateStr}/${dateStr}`;
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
        {/* Top actions */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden h-9 w-9" title="Export">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50 w-56 bg-popover border border-border shadow-lg">
                <DropdownMenuItem asChild className="cursor-pointer gap-2">
                  <a href={calendarUrl()} target="_blank" rel="noopener noreferrer">
                    <Calendar className="h-4 w-4" /> Add to Google Calendar
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => {
                    const bullsForIcs = bulls.map((b) => ({
                      bull_name: b.bulls_catalog ? b.bulls_catalog.bull_name : b.custom_bull_name ?? "Unknown",
                      registration_number: b.bulls_catalog ? b.bulls_catalog.registration_number : "",
                      units: b.units,
                    }));
                    const icsEvents = buildProjectIcsEvents(project, events, bullsForIcs);
                    const icsContent = generateIcsFile(icsEvents, `${project.name} — BeefSynch`);
                    const safeName = project.name.replace(/\s+/g, "_");
                    downloadIcsFile(icsContent, `${safeName}_BeefSynch.ics`);
                    toast({ title: "Calendar downloaded", description: `${project.name} .ics file saved.` });
                  }}
                >
                  <Download className="h-4 w-4" /> Download .ics
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => {
                    generateProjectCsv(project, events, bulls);
                    toast({ title: "CSV downloaded", description: `${project.name} CSV saved.` });
                  }}
                >
                  <Download className="h-4 w-4" /> Download CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="hidden lg:inline-flex">
                  <MoreVertical className="h-4 w-4 mr-1" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50 w-56 bg-popover border border-border shadow-lg">
                <DropdownMenuItem asChild className="cursor-pointer gap-2">
                  <a href={calendarUrl()} target="_blank" rel="noopener noreferrer">
                    <Calendar className="h-4 w-4" /> Add to Google Calendar
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => {
                    const bullsForIcs = bulls.map((b) => ({
                      bull_name: b.bulls_catalog ? b.bulls_catalog.bull_name : b.custom_bull_name ?? "Unknown",
                      registration_number: b.bulls_catalog ? b.bulls_catalog.registration_number : "",
                      units: b.units,
                    }));
                    const icsEvents = buildProjectIcsEvents(project, events, bullsForIcs);
                    const icsContent = generateIcsFile(icsEvents, `${project.name} — BeefSynch`);
                    const safeName = project.name.replace(/\s+/g, "_");
                    downloadIcsFile(icsContent, `${safeName}_BeefSynch.ics`);
                    toast({ title: "Calendar downloaded", description: `${project.name} .ics file saved.` });
                  }}
                >
                  <Download className="h-4 w-4" /> Download .ics
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => {
                    generateProjectCsv(project, events, bulls);
                    toast({ title: "CSV downloaded", description: `${project.name} CSV saved.` });
                  }}
                >
                  <Download className="h-4 w-4" /> Download CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              title="Share PDF"
              onClick={() => {
                generateProjectPdf(project, events, bulls);
                toast({ title: "PDF downloaded", description: `${project.name} report saved.` });
              }}
            >
              <FileDown className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden lg:inline-flex"
              onClick={() => {
                generateProjectPdf(project, events, bulls);
                toast({ title: "PDF downloaded", description: `${project.name} report saved.` });
              }}
            >
              <FileDown className="h-4 w-4 mr-1" /> Share PDF
            </Button>
            <Button variant="outline" size="sm" className="lg:hidden" title="Edit" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="hidden lg:inline-flex" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          </div>
        </div>

        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold font-display text-foreground">
            {project.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-primary/20 text-primary border-primary/30">
              {project.protocol}
            </Badge>
            <Badge
              className={
                project.cattle_type === "Cows"
                  ? "bg-accent/20 text-accent border-accent/30"
                  : "bg-info/20 text-info border-info/30"
              }
            >
              {project.cattle_type}
            </Badge>
            <Badge
              className={
                statusColor[project.status] ??
                "bg-muted text-muted-foreground"
              }
            >
              {project.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {project.head_count} head
            </span>
            <span className="text-sm text-muted-foreground">
              · {breedingDisplay}
              {breedingTimeDisplay && ` at ${breedingTimeDisplay}`}
            </span>
          </div>
        </div>

        {/* Synchronization Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Synchronization Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No protocol events found.
              </p>
            ) : (
              <>
                {/* Mobile condensed view */}
                <div className="lg:hidden divide-y divide-border">
                  {events.map((ev) => {
                    const isNoTime = noTimeEvents.includes(ev.event_name);
                    const time = isNoTime || !ev.event_time ? "" : ` · ${formatTime12(ev.event_time)}`;
                    return (
                      <div key={ev.id} className="flex items-center justify-between py-2 gap-2">
                        <span className="font-medium text-sm text-foreground">{ev.event_name}</span>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(parseISO(ev.event_date), "MMM d, yyyy")}{time}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* Desktop table */}
                <Table className="hidden lg:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((ev) => {
                      const isNoTime = noTimeEvents.includes(ev.event_name);
                      return (
                        <TableRow key={ev.id}>
                          <TableCell className="font-medium">
                            {ev.event_name}
                          </TableCell>
                          <TableCell>
                            {format(parseISO(ev.event_date), "EEEE, MMMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            {isNoTime || !ev.event_time
                              ? "—"
                              : formatTime12(ev.event_time)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        {/* Bulls & Semen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bulls & Semen</CardTitle>
          </CardHeader>
          <CardContent>
            {bulls.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No bulls assigned.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bull Name</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulls.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">
                        {b.bulls_catalog
                          ? `${b.bulls_catalog.bull_name} (${b.bulls_catalog.company})`
                          : b.custom_bull_name ?? "Unknown"}
                      </TableCell>
                      <TableCell className="text-right">{b.units}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        {project.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {project.notes}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <NewProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onProjectCreated={() => load()}
        editData={project ? {
          id: project.id,
          name: project.name,
          cattle_type: project.cattle_type,
          protocol: project.protocol,
          head_count: project.head_count,
          breeding_date: project.breeding_date,
          breeding_time: project.breeding_time,
          status: project.status,
          notes: project.notes,
          bulls: bulls.map((b) => ({
            name: b.bulls_catalog ? b.bulls_catalog.bull_name : b.custom_bull_name ?? "",
            catalogId: b.bull_catalog_id,
            units: b.units,
          })),
        } : null}
      />
    </div>
  );
};

export default ProjectDetail;
