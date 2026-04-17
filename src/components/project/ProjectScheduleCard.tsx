import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, parseISO } from "date-fns";

interface EventRow {
  id: string;
  event_name: string;
  event_date: string;
  event_time: string | null;
}

interface ProjectScheduleCardProps {
  protocol: string;
  events: EventRow[];
}

const isNoTimeEvent = (name: string) => {
  const exact = ["Return Heat", "Estimated Calving"];
  const contains = ["CIDR Insert", "GnRH"];
  return exact.includes(name) || contains.some((k) => name.includes(k));
};

const formatTime12 = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
};

export default function ProjectScheduleCard({
  protocol,
  events,
}: ProjectScheduleCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Synchronization Schedule {protocol && <span className="font-normal text-muted-foreground">— {protocol}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No protocol events found.</p>
        ) : (
          <>
            {/* Mobile condensed view */}
            <div className="lg:hidden divide-y divide-border">
              {events.map((ev) => {
                const isNoTime = isNoTimeEvent(ev.event_name);
                const time = isNoTime || !ev.event_time ? "" : ` · ${formatTime12(ev.event_time)}`;
                return (
                  <div key={ev.id} className="flex items-center justify-between py-2 gap-2">
                    <span className="font-medium text-sm text-foreground">{ev.event_name}</span>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(parseISO(ev.event_date), "MMM d, yyyy")}
                      {time}
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
                  const isNoTime = isNoTimeEvent(ev.event_name);
                  return (
                    <TableRow key={ev.id}>
                      <TableCell className="font-medium">{ev.event_name}</TableCell>
                      <TableCell>
                        {format(parseISO(ev.event_date), "EEEE, MMMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {isNoTime || !ev.event_time ? "—" : formatTime12(ev.event_time)}
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
  );
}
