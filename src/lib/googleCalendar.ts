declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token: string; error?: string }) => void;
          }): { requestAccessToken(): void };
        };
      };
    };
  }
}

import { supabase } from "@/integrations/supabase/client";

// --- Script loader ---
let scriptPromise: Promise<void> | null = null;

export function loadGoogleScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services script"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// --- Token cache ---
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  await loadGoogleScript();

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("VITE_GOOGLE_CLIENT_ID is not configured");
  if (!window.google) throw new Error("Google Identity Services not loaded");

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/calendar.events",
      callback: (response) => {
        if (response.error) {
          reject(new Error(`Google OAuth error: ${response.error}`));
          return;
        }
        cachedToken = response.access_token;
        tokenExpiresAt = Date.now() + 50 * 60 * 1000; // 50 minutes
        resolve(response.access_token);
      },
    });
    client.requestAccessToken();
  });
}

export function isGoogleCalendarConfigured(): boolean {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof id === "string" && id.length > 0;
}

// --- Push events ---
export interface CalendarEventInput {
  protocolEventId: string;
  summary: string;
  description: string;
  eventDate: string; // yyyy-MM-dd
  eventTime: string | null; // HH:mm or null
  isAllDay: boolean;
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function addOneHour(dateStr: string, timeStr: string): string {
  const d = new Date(`${dateStr}T${timeStr}:00`);
  d.setHours(d.getHours() + 1);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export async function pushEventsToGoogleCalendar(
  projectId: string,
  events: CalendarEventInput[],
  userId: string
): Promise<{ created: number; updated: number; errors: string[] }> {
  const token = await getGoogleAccessToken();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data: existing } = await supabase
    .from("google_calendar_events")
    .select("protocol_event_id, google_event_id")
    .eq("user_id", userId)
    .eq("project_id", projectId);

  const syncMap = new Map<string, string>();
  if (existing) {
    for (const row of existing) {
      syncMap.set(row.protocol_event_id, row.google_event_id);
    }
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  for (const ev of events) {
    const body: Record<string, unknown> = {
      summary: ev.summary,
      description: ev.description,
    };

    if (ev.isAllDay) {
      body.start = { date: ev.eventDate };
      body.end = { date: addOneDay(ev.eventDate) };
    } else {
      const startDt = `${ev.eventDate}T${ev.eventTime}:00`;
      const endTime = addOneHour(ev.eventDate, ev.eventTime!);
      const endDt = `${ev.eventDate}T${endTime}:00`;
      body.start = { dateTime: startDt, timeZone };
      body.end = { dateTime: endDt, timeZone };
    }

    const existingGoogleId = syncMap.get(ev.protocolEventId);

    try {
      if (existingGoogleId) {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingGoogleId}`,
          { method: "PATCH", headers, body: JSON.stringify(body) }
        );
        if (!res.ok) {
          const text = await res.text();
          errors.push(`Update failed for "${ev.summary}": ${res.status} ${text}`);
          continue;
        }
        await supabase
          .from("google_calendar_events")
          .update({ synced_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("protocol_event_id", ev.protocolEventId);
        updated++;
      } else {
        const res = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          { method: "POST", headers, body: JSON.stringify(body) }
        );
        if (!res.ok) {
          const text = await res.text();
          errors.push(`Create failed for "${ev.summary}": ${res.status} ${text}`);
          continue;
        }
        const json = await res.json();
        const googleId = json.id as string;
        await supabase.from("google_calendar_events").insert({
          user_id: userId,
          project_id: projectId,
          protocol_event_id: ev.protocolEventId,
          google_event_id: googleId,
          synced_at: new Date().toISOString(),
        });
        created++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error for "${ev.summary}": ${msg}`);
    }
  }

  return { created, updated, errors };
}

// --- Remove events ---
export async function removeEventsFromGoogleCalendar(
  projectId: string,
  userId: string
): Promise<{ removed: number; errors: string[] }> {
  const token = await getGoogleAccessToken();

  const { data: records } = await supabase
    .from("google_calendar_events")
    .select("id, google_event_id")
    .eq("user_id", userId)
    .eq("project_id", projectId);

  const errors: string[] = [];
  let removed = 0;

  if (records) {
    for (const row of records) {
      try {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${row.google_event_id}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!res.ok && res.status !== 410) {
          const text = await res.text();
          errors.push(`Delete failed for ${row.google_event_id}: ${res.status} ${text}`);
          continue;
        }
        removed++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Error deleting ${row.google_event_id}: ${msg}`);
      }
    }
  }

  await supabase
    .from("google_calendar_events")
    .delete()
    .eq("user_id", userId)
    .eq("project_id", projectId);

  return { removed, errors };
}
