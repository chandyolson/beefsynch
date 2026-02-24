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
  console.log("invite-member received request:", req.method, req.url);

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

    // Step 1 — Authenticate the caller
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
    const userId = user.id;
    const inviterEmail = user.email ?? email;

    // Admin client
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Step 2 — Verify caller is owner or admin
    const { data: callerMembership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", organization_id)
      .eq("accepted", true)
      .single();

    if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
      return jsonResponse({ error: "Only owners and admins can invite members" }, 403);
    }

    // Step 3 — Check for duplicate invite
    const { data: existingInvite } = await adminClient
      .from("pending_invites")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("invited_email", email)
      .eq("accepted", false)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();

    const { data: existingMember } = await adminClient
      .from("organization_members")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("invited_email", email)
      .eq("accepted", true)
      .maybeSingle();

    // Also check by user_id if user exists
    const { data: { users: matchedUsers } } = await adminClient.auth.admin.listUsers({
      filter: `email.eq.${email}`,
    });
    const matchedUser = matchedUsers?.[0] ?? null;
    let memberByUserId = null;
    if (matchedUser) {
      const { data } = await adminClient
        .from("organization_members")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("user_id", matchedUser.id)
        .eq("accepted", true)
        .maybeSingle();
      memberByUserId = data;
    }

    if (existingInvite || existingMember || memberByUserId) {
      return jsonResponse({
        error: "An invitation has already been sent to this email address or they are already a member.",
      }, 409);
    }

    // Step 4 — Insert pending invite record
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

    // Step 5 — Insert into organization_members as pending
    const { error: memberInsertErr } = await adminClient
      .from("organization_members")
      .insert({
        organization_id,
        invited_email: email,
        user_id: null,
        role: "member",
        accepted: false,
      });

    if (memberInsertErr) {
      console.error("Failed to insert member record:", memberInsertErr.message);
      return jsonResponse({ error: "Failed to create member record" }, 500);
    }

    // Step 6 — Send email via Resend
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
            <h2 style="margin:0 0 16px;color:#1a1a2e;font-size:22px;">You have been invited!</h2>
            <p style="margin:0 0 12px;color:#4a4a68;font-size:15px;line-height:1.6;">
              You have been invited to join <strong>${org_name}</strong> on <strong>BeefSynch</strong>.
            </p>
            <p style="margin:0 0 24px;color:#4a4a68;font-size:15px;line-height:1.6;">
              Click the button below to create your account and accept the invitation.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
              <tr><td align="center" style="border-radius:6px;background-color:#0da3a3;">
                <a href="${acceptUrl}" target="_blank" style="display:inline-block;padding:14px 40px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:6px;">
                  Accept Invitation
                </a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;color:#8888a0;font-size:13px;text-align:center;">This invitation expires in 48 hours.</p>
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
        subject: `You have been invited to join ${org_name} on BeefSynch`,
        html: htmlContent,
      }),
    });

    if (!resendRes.ok) {
      const resendError = await resendRes.text();
      console.error("Resend API error:", resendRes.status, resendError);
      return jsonResponse({ error: `Failed to send invitation email: ${resendError}` }, 500);
    }

    // Step 7 — Return result
    return jsonResponse({ success: true }, 200);
  } catch (err) {
    console.error("TOP LEVEL CRASH in invite-member:", (err as Error).message, (err as Error).stack);
    return jsonResponse({ error: (err as Error).message || "An unexpected error occurred" }, 500);
  }
});
