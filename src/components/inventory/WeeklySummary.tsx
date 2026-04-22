import { useState, useMemo } from "react";
import { format, subDays, addDays, startOfDay, isSameDay } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  DollarSign,
  ClipboardList,
  Package,
  Truck,
  Activity,
  Printer,
} from "lucide-react";

import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";

type Props = {
  orgId: string;
  onNavigateToTimeline?: () => void;
};

const WeeklySummary = ({ orgId, onNavigateToTimeline }: Props) => {
  // Window defaults to [today-6, today] (a rolling 7-day window inclusive of today).
  // Back/forward arrows step the window by 7 days at a time.
  const [windowEnd, setWindowEnd] = useState(startOfDay(new Date()));
  const windowStart = useMemo(() => subDays(windowEnd, 6), [windowEnd]);
  const isCurrentWeek = isSameDay(windowEnd, startOfDay(new Date()));
  const windowLabel = `${format(windowStart, "MMM d")} — ${format(windowEnd, "MMM d, yyyy")}`;

  const stepBackward = () => setWindowEnd((d) => subDays(d, 7));
  const stepForward = () => {
    const next = addDays(windowEnd, 7);
    setWindowEnd(next > new Date() ? startOfDay(new Date()) : next);
  };
  const resetToCurrent = () => setWindowEnd(startOfDay(new Date()));

  return (
    <div className="space-y-6">
      {/* Header: week picker + Print Week */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={stepBackward}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-medium tabular-nums min-w-[180px] text-center">
            {windowLabel}
          </p>
          <Button
            variant="outline"
            size="icon"
            onClick={stepForward}
            disabled={isCurrentWeek}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentWeek && (
            <Button variant="ghost" size="sm" onClick={resetToCurrent}>
              This Week
            </Button>
          )}
        </div>

        <Button variant="outline" size="sm" disabled>
          <Printer className="h-4 w-4 mr-2" />
          Print Week
        </Button>
      </div>

      {/* Five stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Invoiced this week" value={0} delay={0} index={0} icon={DollarSign} />
        <StatCard title="Projects completed" value={0} delay={50} index={1} icon={ClipboardList} />
        <StatCard title="New orders" value={0} delay={100} index={2} icon={Package} />
        <StatCard title="Shipments received" value={0} delay={150} index={3} icon={Truck} />
        <StatCard
          title="Inventory events"
          value={0}
          delay={200}
          index={0}
          icon={Activity}
          onClick={onNavigateToTimeline}
        />
      </div>

      {/* Eight section placeholders */}
      <SectionPlaceholder title="Invoiced" />
      <SectionPlaceholder title="Projects completed" />
      <SectionPlaceholder title="Projects worked on" />
      <SectionPlaceholder title="New projects created" />
      <SectionPlaceholder title="New orders created" />
      <SectionPlaceholder title="Tanks packed" />
      <SectionPlaceholder title="Tank fills" />
      <SectionPlaceholder title="Shipments received" />
    </div>
  );
};

const SectionPlaceholder = ({ title }: { title: string }) => (
  <div className="rounded-lg border border-border/50 bg-card/40 p-4">
    <h3 className="text-sm font-semibold">{title}</h3>
    <p className="text-xs text-muted-foreground mt-1">Loading in later part…</p>
  </div>
);

export default WeeklySummary;
