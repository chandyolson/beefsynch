import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  pushEventsToGoogleCalendar,
  removeEventsFromGoogleCalendar,
  isGoogleCalendarConfigured,
  isGoogleCalendarConfiguredAsync,
  getGoogleAccessToken,
  listGoogleCalendars,
  type CalendarEventInput,
  type GoogleCalendarInfo,
} from "@/lib/googleCalendar";
import { isNoTimeEvent, formatTime12 } from "@/lib/calendarHelpers";
import { format, parseISO } from "date-fns";

interface SyncProject {
  id: string;
  name: string;
  protocol: string;
  cattle_type: string;
  head_count: number;
  breeding_date: string | null;
  breeding_time: string | null;
}

interface SyncEvent {
  id: string;
  event_name: string;
  event_date: string;
  event_time: string | null;
}

interface SyncBull {
  bulls_catalog: { bull_name: string } | null;
  custom_bull_name: string | null;
  units: number;
}

interface UseGoogleCalendarSyncOptions {
  projectId: string | undefined;
  project: SyncProject | null;
  events: SyncEvent[];
  bulls: SyncBull[];
  userId: string | null;
  orgId: string | null;
}

export function useGoogleCalendarSync({
  projectId,
  project,
  events,
  bulls,
  userId,
  orgId,
}: UseGoogleCalendarSyncOptions) {
  const [pushing, setPushing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarInfo[]>([]);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [orgGoogleCalendarId, setOrgGoogleCalendarId] = useState<string | null>(null);
  const [googleCalendarConfigured, setGoogleCalendarConfigured] = useState(
    isGoogleCalendarConfigured()
  );

  const fetchLastSync = useCallback(async () => {
    if (!projectId || !userId) return;
    const { data } = await supabase
      .from("google_calendar_events")
      .select("synced_at")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .order("synced_at", { ascending: false })
      .limit(1);
    setLastSyncedAt(data && data.length > 0 ? data[0].synced_at : null);
  }, [projectId, userId]);

  useEffect(() => {
    fetchLastSync();
  }, [fetchLastSync]);

  // Fetch org's saved Google Calendar ID
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("organizations")
      .select("google_calendar_id")
      .eq("id", orgId)
      .single()
      .then(({ data }) => {
        if (data?.google_calendar_id) setOrgGoogleCalendarId(data.google_calendar_id);
      });
  }, [orgId]);

  // Check Google Calendar configuration asynchronously
  useEffect(() => {
    if (isGoogleCalendarConfigured()) {
      setGoogleCalendarConfigured(true);
      return;
    }
    let active = true;
    isGoogleCalendarConfiguredAsync().then((configured) => {
      if (active) setGoogleCalendarConfigured(configured);
    });
    return () => { active = false; };
  }, []);

  const buildDescription = useCallback(() => {
    if (!project) return "";
    let desc = `Protocol: ${project.protocol}\nCattle Type: ${project.cattle_type}\nHead Count: ${project.head_count}`;
    if (project.breeding_date) {
      desc += `\nBreeding Date: ${format(parseISO(project.breeding_date), "MMMM d, yyyy")}`;
      if (project.breeding_time) desc += ` at ${formatTime12(project.breeding_time)}`;
    }
    if (bulls.length > 0) {
      desc += "\n\nBulls:";
      for (const b of bulls) {
        const name = b.bulls_catalog ? b.bulls_catalog.bull_name : b.custom_bull_name ?? "Unknown";
        desc += `\n  ${name} — ${b.units} units`;
      }
    }
    return desc;
  }, [project, bulls]);

  const filteredEvents = events.filter((ev) => ev.event_name !== "Return Heat");

  const doPush = async (token: string, calId: string) => {
    if (!project || !userId) return;
    setPushing(true);
    try {
      const description = buildDescription();
      const calendarEvents: CalendarEventInput[] = filteredEvents.map((ev) => {
        const hasTime = !isNoTimeEvent(ev.event_name) && !!ev.event_time;
        const timeSuffix = hasTime ? ` @ ${formatTime12(ev.event_time!)}` : "";
        return {
          protocolEventId: ev.id,
          summary: `${project.name} — ${ev.event_name}${timeSuffix}`,
          description,
          eventDate: ev.event_date,
          eventTime: null,
          isAllDay: true,
        };
      });
      const result = await pushEventsToGoogleCalendar(project.id, calendarEvents, userId, token, calId);
      if (result.errors.length > 0) {
        toast({ title: "Sync completed with errors", description: result.errors.join("\n"), variant: "destructive" });
      } else {
        toast({ title: "Google Calendar synced", description: `${result.created} added, ${result.updated} updated` });
      }
      await fetchLastSync();
    } finally {
      setPushing(false);
    }
  };

  const handlePushToGoogle = async () => {
    if (!userId) return;
    try {
      const token = await getGoogleAccessToken();
      if (!orgGoogleCalendarId) {
        setPushing(true);
        const calendars = await listGoogleCalendars(token);
        setGoogleCalendars(calendars);
        setShowCalendarPicker(true);
        setPushing(false);
        return;
      }
      await doPush(token, orgGoogleCalendarId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Google Calendar", description: msg || "Sign-in cancelled", variant: "destructive" });
      setPushing(false);
    }
  };

  const handleCalendarSelected = async (calId: string) => {
    if (!orgId) return;
    await supabase.from("organizations").update({ google_calendar_id: calId }).eq("id", orgId);
    setOrgGoogleCalendarId(calId);
    setShowCalendarPicker(false);
    const selectedCal = googleCalendars.find((c) => c.id === calId);
    toast({ title: "Calendar saved", description: `"${selectedCal?.summary || calId}" will be used for all projects.` });
    try {
      const token = await getGoogleAccessToken();
      await doPush(token, calId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Google Calendar", description: msg || "Push failed", variant: "destructive" });
    }
  };

  const handleChangeCalendar = async () => {
    try {
      const token = await getGoogleAccessToken();
      const calendars = await listGoogleCalendars(token);
      setGoogleCalendars(calendars);
      setShowCalendarPicker(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Google Calendar", description: msg || "Sign-in cancelled", variant: "destructive" });
    }
  };

  const handleRemoveFromGoogle = async () => {
    if (!project || !userId) return;
    try {
      const token = await getGoogleAccessToken();
      setRemoving(true);
      const result = await removeEventsFromGoogleCalendar(
        project.id, userId, token, orgGoogleCalendarId || "primary"
      );
      if (result.errors.length > 0) {
        toast({ title: "Removed with errors", description: result.errors.join("\n"), variant: "destructive" });
      } else {
        toast({ title: "Events removed", description: `${result.removed} events removed from Google Calendar.` });
      }
      setLastSyncedAt(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Google Calendar", description: msg || "Sign-in cancelled", variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  return {
    pushing,
    removing,
    lastSyncedAt,
    googleCalendars,
    showCalendarPicker,
    setShowCalendarPicker,
    orgGoogleCalendarId,
    googleCalendarConfigured,
    filteredEvents,
    buildDescription,
    handlePushToGoogle,
    handleCalendarSelected,
    handleChangeCalendar,
    handleRemoveFromGoogle,
  };
}
