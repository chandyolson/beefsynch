/**
 * Google Calendar integration — OAuth token management and CRUD operations.
 * Uses Google Identity Services (GIS) for auth and the Calendar v3 REST API.
 * Sync state is persisted in the `google_calendar_events` Supabase table.
 */
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

// --- Token + client-id cache ---
let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let cachedClientId: string | null =
  typeof import.meta.env.VITE_GOOGLE_CLIENT_ID === "string" &&
  import.meta.env.VITE_GOOGLE_CLIENT_ID.trim().length > 0
    ? import.meta.env.VITE_GOOGLE_CLIENT_ID.trim()
    : null;
let clientIdPromise: Promise<string> | null = null;

async function resolveGoogleClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  if (clientIdPromise) return clientIdPromise;

  clientIdPromise = (async () => {
    const { data, error } = await supabase.functions.invoke("google-calendar-config", {
      body: {},
    });

    if (error) {
      throw new Error("Google Calendar configuration could not be loaded");
    }

    const clientId =
      typeof (data as { clientId?: string } | null)?.clientId === "string"
        ? (data as { clientId?: string }).clientId!.trim()
        : "";

    if (!clientId) {
      throw new Error("VITE_GOOGLE_CLIENT_ID is not configured");
    }

    cachedClientId = clientId;
    return clientId;
  })();

  try {
    return await clientIdPromise;
  } finally {
    clientIdPromise = null;
  }
}

export async function isGoogleCalendarConfiguredAsync(): Promise<boolean> {
  try {
    await resolveGoogleClientId();
    return true;
  } catch {
    return false;
  }
}

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  await loadGoogleScript();

  const clientId = await resolveGoogleClientId();
  if (!window.google) throw new Error("Google Identity Services not loaded");

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
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
  return !!cachedClientId;
}

// --- List calendars ---
export interface GoogleCalendarInfo {
  id: string;
  summary: string;
  primary: boolean;
}

export async function listGoogleCalendars(accessToken: string): Promise<GoogleCalendarInfo[]> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Failed to list calendars: ${res.status}`);
  const json = await res.json();
  return (json.items || [])
    .filter((c: any) => c.accessRole === "owner" || c.accessRole === "writer")
    .map((c: any) => ({
      id: c.id,
      summary: c.summary || c.id,
      primary: !!c.primary,
    }));
}

// --- Push events ---
export interface CalendarEventInput {
  protocolEventId: string;
  summary: string;
  description: string;
  eventDate: string;
  eventTime: string | null;
  isAllDay: boolean;
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function pushEventsToGoogleCalendar(
  projectId: string,
  events: CalendarEventInput[],
  userId: string,
  accessToken: string,
  calendarId: string
): Promise<{ created: number; updated: number; errors: string[] }> {
  const token = accessToken;
  const encodedCalId = encodeURIComponent(calendarId);

  console.log("[BeefSynch] Pushing", events.length, "events to calendar:", calendarId);

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
    console.log("[BeefSynch] Processing event:", ev.summary, "| allDay:", ev.isAllDay, "| date:", ev.eventDate, "| time:", ev.eventTime);

    const body: Record<string, unknown> = {
      summary: ev.summary,
      description: ev.description,
    };

    // All events are pushed as all-day — times are in the title for visibility
    body.start = { date: ev.eventDate };
    body.end = { date: addOneDay(ev.eventDate) };

    const existingGoogleId = syncMap.get(ev.protocolEventId);
    let needsCreate = !existingGoogleId;

    try {
      if (existingGoogleId) {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}/events/${existingGoogleId}`,
          { method: "PATCH", headers, body: JSON.stringify(body) }
        );
        if (!res.ok) {
          if (res.status === 404 || res.status === 410) {
            console.warn("[BeefSynch] Event gone from Google, will re-create:", ev.summary);
            await supabase
              .from("google_calendar_events")
              .delete()
              .eq("user_id", userId)
              .eq("protocol_event_id", ev.protocolEventId);
            needsCreate = true;
          } else {
            const text = await res.text();
            console.error("[BeefSynch] Failed:", ev.summary, "→", res.status, text);
            errors.push(`Update failed for "${ev.summary}": ${res.status} ${text}`);
            continue;
          }
        } else {
          await supabase
            .from("google_calendar_events")
            .update({ synced_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("protocol_event_id", ev.protocolEventId);
          updated++;
          console.log("[BeefSynch] Updated:", ev.summary);
        }
      }

      if (needsCreate) {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}/events`,
          { method: "POST", headers, body: JSON.stringify(body) }
        );
        if (!res.ok) {
          const text = await res.text();
          console.error("[BeefSynch] Failed:", ev.summary, "→", res.status, text);
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
          google_calendar_id: calendarId,
          synced_at: new Date().toISOString(),
        });
        created++;
        console.log("[BeefSynch] Created:", ev.summary, "→ Google ID:", googleId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[BeefSynch] Failed:", ev.summary, "→", msg);
      errors.push(`Error for "${ev.summary}": ${msg}`);
    }
  }

  console.log("[BeefSynch] Done. Created:", created, "Updated:", updated, "Errors:", errors.length);
  return { created, updated, errors };
}

// --- Remove events ---
export async function removeEventsFromGoogleCalendar(
  projectId: string,
  userId: string,
  accessToken: string,
  calendarId: string
): Promise<{ removed: number; errors: string[] }> {
  const token = accessToken;
  const encodedCalId = encodeURIComponent(calendarId);

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
          `https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}/events/${row.google_event_id}`,
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
