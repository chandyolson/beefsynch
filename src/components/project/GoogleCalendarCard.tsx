import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, ExternalLink, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { GoogleCalendarInfo } from "@/lib/googleCalendar";

interface GoogleCalendarCardProps {
  googleCalendarConfigured: boolean;
  showCalendarPicker: boolean;
  googleCalendars: GoogleCalendarInfo[];
  orgGoogleCalendarId: string | null;
  lastSyncedAt: string | null;
  pushing: boolean;
  removing: boolean;
  filteredEventsLength: number;
  onPushToGoogle: () => void;
  onCalendarSelected: (calId: string) => void;
  onChangeCalendar: () => void;
  onRemoveFromGoogle: () => void;
  onOpenEventsInBrowser: () => void;
  setShowCalendarPicker: (show: boolean) => void;
}

export default function GoogleCalendarCard({
  googleCalendarConfigured,
  showCalendarPicker,
  googleCalendars,
  orgGoogleCalendarId,
  lastSyncedAt,
  pushing,
  removing,
  filteredEventsLength,
  onPushToGoogle,
  onCalendarSelected,
  onChangeCalendar,
  onRemoveFromGoogle,
  onOpenEventsInBrowser,
  setShowCalendarPicker,
}: GoogleCalendarCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          Google Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {googleCalendarConfigured && (
          <div className="space-y-3">
            {/* Calendar picker */}
            {showCalendarPicker && googleCalendars.length > 0 && (
              <div className="rounded-lg border border-border bg-secondary/50 p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Choose a Google Calendar</p>
                <p className="text-xs text-muted-foreground">
                  All projects in your organization will push events to this calendar.
                </p>
                <Select onValueChange={onCalendarSelected}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a calendar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {googleCalendars.map((cal) => (
                      <SelectItem key={cal.id} value={cal.id}>
                        {cal.summary}
                        {cal.primary ? " (Primary)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => setShowCalendarPicker(false)}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Push / Remove buttons */}
            {!showCalendarPicker && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={onPushToGoogle} disabled={pushing || filteredEventsLength === 0}>
                    {pushing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Pushing…
                      </>
                    ) : (
                      <>
                        <Calendar className="h-4 w-4 mr-1" /> Push to Google Calendar
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground text-xs"
                    onClick={onRemoveFromGoogle}
                    disabled={removing}
                  >
                    {removing ? "Removing…" : "Remove from Calendar"}
                  </Button>
                </div>
                {orgGoogleCalendarId && (
                  <button
                    onClick={onChangeCalendar}
                    className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                  >
                    Change calendar
                  </button>
                )}
                {lastSyncedAt && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {format(parseISO(lastSyncedAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* URL fallback */}
        <div className="pt-1">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onOpenEventsInBrowser}
            disabled={filteredEventsLength === 0}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open events in browser
          </Button>
          <p className="text-xs text-muted-foreground mt-1">Opens a new tab for each event</p>
        </div>
      </CardContent>
    </Card>
  );
}
