import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    const { email, organization_id, org_name, redirect_url } = body;
    if (!email || !organization_id || !org_name) {
      return jsonResponse({ error: "Missing email, organization_id, or org_name" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey || !resendApiKey) {
      console.error("Missing required environment variables");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing auth" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Admin client
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is owner or admin
    const { data: callerMembership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organization_id)
      .eq("accepted", true)
      .single();

    if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
      return jsonResponse({ error: "Only owners and admins can resend invitations" }, 403);
    }

    // Fetch the organization's invite_code
    const { data: orgData } = await adminClient
      .from("organizations")
      .select("invite_code")
      .eq("id", organization_id)
      .single();

    const inviteCode = orgData?.invite_code ?? "";

    // Delete old pending invite(s) for this email + org
    await adminClient
      .from("pending_invites")
      .delete()
      .eq("invited_email", email)
      .eq("organization_id", organization_id);

    // Create a fresh pending invite (7-day default from DB)
    const { data: invite, error: inviteInsertErr } = await adminClient
      .from("pending_invites")
      .insert({
        organization_id,
        invited_email: email,
        accepted: false,
      })
      .select("token")
      .single();

    if (inviteInsertErr || !invite) {
      console.error("Failed to insert pending invite:", inviteInsertErr?.message);
      return jsonResponse({ error: "Failed to create invitation record" }, 500);
    }

    // Send email via Resend
    const acceptUrl = `${redirect_url || "https://beefsynch.com"}/accept-invite?token=${invite.token}`;

    const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background-color:#102175;padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:0.5px;">BeefSynch</h1>
            <p style="margin:4px 0 0;color:#8b9fd6;font-size:13px;">Synchronization &amp; Breeding Management</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px;color:#1a1a2e;font-size:22px;">Reminder: You've been invited!</h2>
            <p style="margin:0 0 12px;color:#4a4a68;font-size:15px;line-height:1.6;">
              You've been invited to join <strong>${org_name}</strong> on <strong>BeefSynch</strong>.
              Click the button below to accept, or use the organization code <strong style="color:#0da3a3;letter-spacing:1px;">${inviteCode}</strong> to join manually from the Join Organization screen.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
              <tr><td align="center" style="border-radius:6px;background-color:#0da3a3;">
                <a href="${acceptUrl}" target="_blank" style="display:inline-block;padding:14px 40px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:6px;">
                  Accept Invitation
                </a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;color:#8888a0;font-size:13px;text-align:center;">This invitation expires in 7 days.</p>
            <p style="margin:0;color:#8888a0;font-size:13px;text-align:center;">If you did not expect this invitation you can safely ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#f8f8fb;padding:20px 40px;text-align:center;">
            <p style="margin:0;color:#aaaabc;font-size:12px;">BeefSynch by Chuteside Resources &nbsp;|&nbsp; beefsynch.com</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "BeefSynch <invites@mail.beefsynch.com>",
        to: [email],
        subject: `Reminder: You've been invited to join ${org_name} on BeefSynch`,
        html: htmlContent,
      }),
    });

    if (!resendRes.ok) {
      const resendError = await resendRes.text();
      console.error("Resend API error:", resendRes.status, resendError);
      return jsonResponse({ error: `Failed to send invitation email: ${resendError}` }, 500);
    }

    return jsonResponse({ success: true }, 200);
  } catch (err) {
    console.error("TOP LEVEL CRASH in resend-invite:", (err as Error).message, (err as Error).stack);
    return jsonResponse({ error: (err as Error).message || "An unexpected error occurred" }, 500);
  }
});
