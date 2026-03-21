import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch all organizations
    const { data: orgs, error: orgsErr } = await supabase.from("organizations").select("*");
    if (orgsErr) throw new Error(`Failed to fetch organizations: ${orgsErr.message}`);

    const enrichedOrgs = [];
    for (const org of orgs || []) {
      const [membersRes, projectsRes, invitesRes] = await Promise.all([
        supabase.from("organization_members").select("*").eq("organization_id", org.id),
        supabase.from("projects").select("*").eq("organization_id", org.id),
        supabase.from("pending_invites").select("*").eq("organization_id", org.id),
      ]);

      if (membersRes.error) throw new Error(`Failed to fetch members for org ${org.id}: ${membersRes.error.message}`);
      if (projectsRes.error) throw new Error(`Failed to fetch projects for org ${org.id}: ${projectsRes.error.message}`);
      if (invitesRes.error) throw new Error(`Failed to fetch invites for org ${org.id}: ${invitesRes.error.message}`);

      const projectIds = (projectsRes.data || []).map((p) => p.id);

      let bullsData: any[] = [];
      let eventsData: any[] = [];

      if (projectIds.length > 0) {
        const [bullsRes, eventsRes] = await Promise.all([
          supabase
            .from("project_bulls")
            .select("*, bulls_catalog(bull_name, company, registration_number)")
            .in("project_id", projectIds),
          supabase.from("protocol_events").select("*").in("project_id", projectIds),
        ]);
        if (bullsRes.error) throw new Error(`Failed to fetch project bulls: ${bullsRes.error.message}`);
        if (eventsRes.error) throw new Error(`Failed to fetch protocol events: ${eventsRes.error.message}`);
        bullsData = bullsRes.data || [];
        eventsData = eventsRes.data || [];
      }

      const bullsByProject = new Map<string, any[]>();
      for (const b of bullsData) {
        const arr = bullsByProject.get(b.project_id) || [];
        arr.push(b);
        bullsByProject.set(b.project_id, arr);
      }

      const eventsByProject = new Map<string, any[]>();
      for (const e of eventsData) {
        const arr = eventsByProject.get(e.project_id) || [];
        arr.push(e);
        eventsByProject.set(e.project_id, arr);
      }

      const enrichedProjects = (projectsRes.data || []).map((p) => ({
        ...p,
        bulls: bullsByProject.get(p.id) || [],
        events: eventsByProject.get(p.id) || [],
      }));

      enrichedOrgs.push({
        ...org,
        members: membersRes.data || [],
        projects: enrichedProjects,
        pending_invites: invitesRes.data || [],
      });
    }

    // Bulls catalog (global)
    const { data: bullsCatalog, error: catErr } = await supabase.from("bulls_catalog").select("*");
    if (catErr) throw new Error(`Failed to fetch bulls catalog: ${catErr.message}`);

    const exportData = {
      exported_at: new Date().toISOString(),
      organizations: enrichedOrgs,
      bulls_catalog: bullsCatalog || [],
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(jsonString)));
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `BeefSynch_Backup_${dateStr}.json`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "BeefSynch <backups@mail.beefsynch.com>",
        to: ["office@catlresources.com"],
        subject: `BeefSynch Daily Backup - ${dateStr}`,
        html: `<p>Attached is your daily BeefSynch data backup generated on ${dateStr}.</p><p>This file contains all organizations, projects, breeding schedules, bull assignments, and team member data.</p><p><em>BeefSynch by Chuteside Resources</em></p>`,
        attachments: [
          {
            filename,
            content: base64Content,
          },
        ],
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      throw new Error(`Resend API error (${emailRes.status}): ${errBody}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        exported_at: exportData.exported_at,
        org_count: enrichedOrgs.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
