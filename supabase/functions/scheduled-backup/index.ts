/**
 * scheduled-backup Edge Function
 *
 * Nightly cron entry point (see pg_cron job "beefsynch-nightly-backup").
 * Delegates the actual export to full-export so there is ONE source of
 * truth for what gets backed up, then emails the resulting ZIP as an
 * attachment via Resend.
 *
 * Auth: service-role key only (passed in Authorization header).
 */

Deno.serve(async (req) => {
  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    // Delegate to full-export to build the comprehensive ZIP.
    const exportRes = await fetch(`${supabaseUrl}/functions/v1/full-export`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!exportRes.ok) {
      const errBody = await exportRes.text();
      throw new Error(`full-export failed (${exportRes.status}): ${errBody}`);
    }
    const zipBytes = new Uint8Array(await exportRes.arrayBuffer());

    // Base64-encode the ZIP for the Resend attachment field.
    // Chunked to avoid stack overflows on large buffers.
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < zipBytes.length; i += CHUNK) {
      binary += String.fromCharCode(...zipBytes.subarray(i, i + CHUNK));
    }
    const base64Content = btoa(binary);

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `BeefSynch_Backup_${dateStr}.zip`;

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
        html:
          `<p>Attached is your daily BeefSynch data backup generated on ${dateStr}.</p>` +
          `<p>This ZIP contains JSONL dumps of every public-schema table, the auth.users / auth.identities rows, and storage bucket metadata for <code>shipment-documents</code>, <code>email-assets</code>, and <code>documents</code>.</p>` +
          `<p><em>BeefSynch by Chuteside Resources</em></p>`,
        attachments: [{ filename, content: base64Content }],
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      throw new Error(`Resend API error (${emailRes.status}): ${errBody}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        size_bytes: zipBytes.length,
        emailed_at: new Date().toISOString(),
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
