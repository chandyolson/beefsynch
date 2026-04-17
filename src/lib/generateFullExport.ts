import { supabase } from "@/integrations/supabase/client";

export async function generateFullExport(orgId: string) {
  // Organization
  const { data: organization, error: orgErr } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .single();
  if (orgErr) throw new Error(`Failed to export organization: ${orgErr.message}`);

  // Members
  const { data: members, error: memErr } = await supabase
    .rpc("get_org_members", { _organization_id: orgId });
  if (memErr) throw new Error(`Failed to export members: ${memErr.message}`);

  // Projects
  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("*")
    .eq("organization_id", orgId);
  if (projErr) throw new Error(`Failed to export projects: ${projErr.message}`);

  // For each project, fetch bulls and events
  const projectIds = (projects || []).map((p) => p.id);

  const [bullsRes, eventsRes] = await Promise.all([
    projectIds.length > 0
      ? supabase
          .from("project_bulls")
          .select("*, bulls_catalog(bull_name, company, registration_number)")
          .in("project_id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length > 0
      ? supabase
          .from("protocol_events")
          .select("*")
          .in("project_id", projectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (bullsRes.error) throw new Error(`Failed to export project bulls: ${bullsRes.error.message}`);
  if (eventsRes.error) throw new Error(`Failed to export protocol events: ${eventsRes.error.message}`);

  const bullsByProject = new Map<string, any[]>();
  for (const b of bullsRes.data || []) {
    const arr = bullsByProject.get(b.project_id) || [];
    arr.push(b);
    bullsByProject.set(b.project_id, arr);
  }

  const eventsByProject = new Map<string, any[]>();
  for (const e of eventsRes.data || []) {
    const arr = eventsByProject.get(e.project_id) || [];
    arr.push(e);
    eventsByProject.set(e.project_id, arr);
  }

  const enrichedProjects = (projects || []).map((p) => ({
    ...p,
    bulls: bullsByProject.get(p.id) || [],
    events: eventsByProject.get(p.id) || [],
  }));

  // Pending invites
  const { data: pendingInvites, error: invErr } = await supabase
    .from("pending_invites")
    .select("*")
    .eq("organization_id", orgId);
  if (invErr) throw new Error(`Failed to export pending invites: ${invErr.message}`);

  // Bulls catalog (org-specific + shared)
  const { data: bullsCatalog, error: catErr } = await supabase
    .from("bulls_catalog")
    .select("*")
    .or(`organization_id.is.null,organization_id.eq.${orgId}`);
  if (catErr) throw new Error(`Failed to export bulls catalog: ${catErr.message}`);

  const exportData = {
    exported_at: new Date().toISOString(),
    organization,
    members: members || [],
    projects: enrichedProjects,
    pending_invites: pendingInvites || [],
    bulls_catalog: bullsCatalog || [],
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const orgName = (organization.name || "org").replace(/\s+/g, "_");
  const date = new Date().toISOString().slice(0, 10);
  const filename = `BeefSynch_Backup_${orgName}_${date}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
