import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  format,
  isSameMonth,
  isSameDay,
  parseISO,
} from "date-fns";
import Navbar from "@/components/Navbar";
import {
  generateIcsFile,
  buildProjectIcsEvents,
  downloadIcsFile,
  type IcsEvent,
} from "@/lib/generateIcs";

interface CalendarEvent {
  id: string;
  event_name: string;
  event_date: string;
  event_time: string | null;
  project_id: string;
  project_name: string;
}

// Distinct colors for event types
const EVENT_COLORS: Record<string, string> = {
  "GnRH": "bg-emerald-500/80 text-white",
  "GnRH+CIDR Insert": "bg-emerald-500/80 text-white",
  "PGF": "bg-rose-500/80 text-white",
  "PGF+CIDR Out": "bg-rose-500/80 text-white",
  "PGF+CIDR Insert": "bg-orange-500/80 text-white",
  "CIDR Out+PGF": "bg-orange-500/80 text-white",
  "Bulls In": "bg-sky-500/80 text-white",
  "MGA Start": "bg-violet-500/80 text-white",
  "MGA End": "bg-fuchsia-500/80 text-white",
  "Timed Breeding": "bg-amber-500/80 text-white",
  "Return Heat": "bg-teal-500/80 text-white",
  "Estimated Calving": "bg-pink-400/80 text-white",
};

const DEFAULT_COLOR = "bg-indigo-500/80 text-white";

const getEventColor = (eventName: string) => {
  if (EVENT_COLORS[eventName]) return EVENT_COLORS[eventName];
  for (const key of Object.keys(EVENT_COLORS)) {
    if (eventName.includes(key)) return EVENT_COLORS[key];
  }
  return DEFAULT_COLOR;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface ProjectMeta {
  id: string;
  name: string;
  protocol: string;
  cattle_type: string;
  head_count: number;
  breeding_date: string | null;
  breeding_time: string | null;
  status: string;
}

const MasterCalendar = () => {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [projectMap, setProjectMap] = useState<Map<string, ProjectMeta>>(new Map());
  const [bullMap, setBullMap] = useState<Map<string, { bull_name: string; registration_number: string; units: number }[]>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      const start = format(startOfWeek(startOfMonth(currentMonth)), "yyyy-MM-dd");
      const end = format(endOfWeek(endOfMonth(currentMonth)), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("protocol_events")
        .select("id, event_name, event_date, event_time, project_id, projects(id, name, protocol, cattle_type, head_count, breeding_date, breeding_time, status)")
        .gte("event_date", start)
        .lte("event_date", end)
        .order("event_date", { ascending: true });

      if (data) {
        const pMap = new Map<string, ProjectMeta>();
        const evts = data.map((d: any) => {
          const proj = d.projects;
          if (proj && !pMap.has(proj.id)) {
            pMap.set(proj.id, proj as ProjectMeta);
          }
          return {
            ...d,
            project_name: proj?.name ?? "Unknown",
          };
        });
        setEvents(evts);
        setProjectMap(pMap);

        // Fetch bulls for all visible projects
        const projectIds = [...pMap.keys()];
        if (projectIds.length > 0) {
          const { data: bullData } = await supabase
            .from("project_bulls")
            .select("project_id, units, custom_bull_name, bull_catalog_id, bulls_catalog(bull_name, registration_number)")
            .in("project_id", projectIds);

          if (bullData) {
            const bMap = new Map<string, { bull_name: string; registration_number: string; units: number }[]>();
            for (const b of bullData as any[]) {
              const pid = b.project_id;
              if (!bMap.has(pid)) bMap.set(pid, []);
              bMap.get(pid)!.push({
                bull_name: b.bulls_catalog ? b.bulls_catalog.bull_name : b.custom_bull_name ?? "Unknown",
                registration_number: b.bulls_catalog ? b.bulls_catalog.registration_number : "",
                units: b.units,
              });
            }
            setBullMap(bMap);
          }
        }
      }
      setLoading(false);
    };

    fetchEvents();
  }, [currentMonth]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = endOfWeek(monthEnd);

    const days: Date[] = [];
    let day = gridStart;
    while (day <= gridEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  // Group events by date string
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      const key = ev.event_date;
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [events]);

  // Unique event names for legend
  const legendItems = useMemo(() => {
    const seen = new Set<string>();
    const items: { name: string; color: string }[] = [];
    for (const ev of events) {
      if (!seen.has(ev.event_name)) {
        seen.add(ev.event_name);
        items.push({ name: ev.event_name, color: getEventColor(ev.event_name) });
      }
    }
    return items;
  }, [events]);

  const handleDownloadIcs = () => {
    // Group events by project, then build ICS events
    const byProject = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (!byProject.has(ev.project_id)) byProject.set(ev.project_id, []);
      byProject.get(ev.project_id)!.push(ev);
    }

    const allIcsEvents: IcsEvent[] = [];
    for (const [pid, projEvents] of byProject) {
      const proj = projectMap.get(pid);
      if (!proj) continue;
      const bulls = bullMap.get(pid) ?? [];
      const icsEvents = buildProjectIcsEvents(proj, projEvents, bulls);
      allIcsEvents.push(...icsEvents);
    }

    const icsContent = generateIcsFile(allIcsEvents, "BeefSynch Breeding Calendar");
    const filename = `BeefSynch_Calendar_${format(currentMonth, "MMMMyyyy")}.ics`;
    downloadIcsFile(icsContent, filename);
  };

  const today = new Date();

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-6 max-w-6xl space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleDownloadIcs} disabled={events.length === 0}>
                  <Download className="h-4 w-4 mr-1" /> Download Calendar
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Downloads visible events as a .ics calendar file</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-2xl font-bold font-display text-foreground">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-px rounded-lg overflow-hidden border border-border/40">
          {calendarDays.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDate[dateKey] || [];
            const inMonth = isSameMonth(day, currentMonth);
            const isToday = isSameDay(day, today);

            return (
              <div
                key={dateKey}
                className={`min-h-[100px] p-1.5 flex flex-col ${
                  inMonth ? "bg-white/[0.04]" : "bg-white/[0.01]"
                } ${isToday ? "ring-1 ring-primary/50" : ""}`}
              >
                <span
                  className={`text-xs font-medium mb-1 self-end w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday
                      ? "bg-primary text-white"
                      : inMonth
                      ? "text-foreground"
                      : "text-muted-foreground/40"
                  }`}
                >
                  {format(day, "d")}
                </span>
                <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => navigate(`/project/${ev.project_id}`)}
                      className={`${getEventColor(ev.event_name)} text-[10px] leading-tight px-1.5 py-0.5 rounded truncate text-left hover:opacity-80 transition-opacity cursor-pointer`}
                      title={`${ev.event_name} — ${ev.project_name}`}
                    >
                      {ev.project_name} — {ev.event_name}
                    </button>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-muted-foreground pl-1">
                      +{dayEvents.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        {legendItems.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground font-display">Event Legend</h3>
            <div className="flex flex-wrap gap-2">
              {legendItems.map((item) => (
                <span
                  key={item.name}
                  className={`${item.color} text-[11px] px-2 py-1 rounded-full font-medium`}
                >
                  {item.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <p className="text-center text-sm text-muted-foreground">Loading events…</p>
        )}
      </div>
    </div>
  );
};

export default MasterCalendar;
