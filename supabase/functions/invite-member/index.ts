import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: any;
  try {
    body = await req.json();
    console.log("Received request body:", JSON.stringify(body));
  } catch (e) {
    console.error("Failed to parse request body:", e);
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("Missing or invalid Authorization header");
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller using anon key client with auth header
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error("User verification failed:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;
    console.log("Authenticated user:", userId);

    // Admin client with service role key
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { email, organization_id, redirect_url } = body;
    if (!email || !organization_id) {
      console.error("Missing required fields:", { email, organization_id });
      return new Response(JSON.stringify({ error: "Missing email or organization_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is owner or admin
    const { data: callerMembership, error: memberErr } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", organization_id)
      .eq("accepted", true)
      .single();

    console.log("Caller membership:", callerMembership, "error:", memberErr?.message);

    if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
      return new Response(JSON.stringify({ error: "Only owners and admins can invite members" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already invited by email
    const { data: existingByEmail, error: existErr } = await adminClient
      .from("organization_members")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("invited_email", email)
      .maybeSingle();

    console.log("Existing by invited_email:", existingByEmail, "error:", existErr?.message);

    if (existingByEmail) {
      return new Response(JSON.stringify({ error: "This person is already a member of your organization." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already exists and is a member
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const matchedUser = existingUsers?.users?.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (matchedUser) {
      const { data: existingMember } = await adminClient
        .from("organization_members")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("user_id", matchedUser.id)
        .maybeSingle();
      if (existingMember) {
        console.log("User already a member by user_id:", matchedUser.id);
        return new Response(JSON.stringify({ error: "This person is already a member of your organization." }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Send invite email
    const redirectTo = redirect_url
      ? `${redirect_url}/onboarding`
      : `${supabaseUrl.replace(".supabase.co", ".lovable.app")}/onboarding`;

    console.log("Sending invite to:", email, "redirectTo:", redirectTo);

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });

    if (inviteError) {
      console.error("inviteUserByEmail failed:", inviteError.message);
      return new Response(JSON.stringify({ error: `Failed to send invitation: ${inviteError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("Invite sent successfully, user id:", inviteData?.user?.id);

    // Insert pending member record
    const { error: insertError } = await adminClient
      .from("organization_members")
      .insert({
        organization_id,
        invited_email: email,
        role: "member",
        accepted: false,
        user_id: null,
      });

    if (insertError) {
      console.error("Insert member record failed:", insertError.message);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Invitation complete for:", email);
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unhandled error in invite-member:", err);
    return new Response(JSON.stringify({ error: err.message || "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
