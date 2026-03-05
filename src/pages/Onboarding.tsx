import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useOrgRole } from "@/hooks/useOrgRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, Users } from "lucide-react";

type Path = "choose" | "create" | "join";

const Onboarding = () => {
  const navigate = useNavigate();
  const { refresh } = useOrgRole();
  const [path, setPath] = useState<Path>("choose");
  const [orgName, setOrgName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);

  // Guard: if user already has an org, redirect to dashboard
  useEffect(() => {
    const checkExistingOrg = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.is_anonymous) {
        navigate("/auth", { replace: true });
        return;
      }
      const { data } = await supabase
        .from("organization_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("accepted", true)
        .limit(1);
      if (data && data.length > 0) {
        // User already has an org — mark onboarding complete before redirecting
        // to prevent a redirect loop between / and /onboarding
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          await supabase
            .from("profiles")
            .upsert(
              { user_id: currentUser.id, has_completed_onboarding: true },
              { onConflict: "user_id" }
            );
        }
        navigate("/", { replace: true });
      }
    };
    checkExistingOrg();
  }, [navigate]);

  const handleCreate = async () => {
    if (!orgName.trim()) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
      navigate("/auth", { replace: true });
      return;
    }

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: orgName.trim(), created_by: user.id })
      .select("id")
      .single();

    if (orgError || !org) {
      toast({ title: "Could not create organization", description: orgError?.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({ user_id: user.id, organization_id: org.id, role: "owner", accepted: true });

    if (memberError) {
      toast({ title: "Organization created but membership failed", description: memberError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    await refresh();

    // Confirm membership exists before navigating
    const { data: confirmed } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", org.id)
      .eq("accepted", true)
      .limit(1);

    if (!confirmed || confirmed.length === 0) {
      toast({ title: "Something went wrong", description: "Organization membership could not be confirmed.", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Mark onboarding complete
    await supabase.from("profiles").upsert({ user_id: user.id, has_completed_onboarding: true }, { onConflict: "user_id" });

    toast({ title: `Welcome to BeefSynch!`, description: `Your organization ${orgName.trim()} has been created.` });
    setLoading(false);
    navigate("/");
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
      navigate("/auth", { replace: true });
      return;
    }

    const { data: orgs, error: lookupError } = await supabase
      .rpc("lookup_org_by_invite_code", { _code: inviteCode.trim() });

    const org = orgs && orgs.length > 0 ? orgs[0] : null;

    if (lookupError || !org) {
      toast({ title: "Invalid invite code", description: "No organization found with that code.", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Check if user is already an accepted member of this org
    const { data: existingAccepted } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", org.id)
      .eq("accepted", true)
      .limit(1);

    if (existingAccepted && existingAccepted.length > 0) {
      await refresh();
      toast({ title: "Already a member", description: `You're already part of ${org.name}.` });
      setLoading(false);
      navigate("/");
      return;
    }

    // Check if there's a pending invitation row for this user's email — update it instead of inserting
    const userEmail = user.email?.toLowerCase() ?? "";
    const { data: pendingRow } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", org.id)
      .eq("invited_email", userEmail)
      .eq("accepted", false)
      .limit(1);

    if (pendingRow && pendingRow.length > 0) {
      // Update the existing pending row to claim it
      const { error: updateError } = await supabase
        .from("organization_members")
        .update({ user_id: user.id, accepted: true })
        .eq("id", pendingRow[0].id);

      if (updateError) {
        toast({ title: "Could not join organization", description: updateError.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      // Also mark any pending_invites for this email as accepted
      await supabase
        .from("pending_invites")
        .update({ accepted: true })
        .eq("organization_id", org.id)
        .eq("invited_email", userEmail)
        .eq("accepted", false);
    } else {
      // No pending row exists — insert a fresh one
      const { error: memberError } = await supabase
        .from("organization_members")
        .insert({ user_id: user.id, organization_id: org.id, role: "member", accepted: true });

      if (memberError) {
        toast({ title: "Could not join organization", description: memberError.message, variant: "destructive" });
        setLoading(false);
        return;
      }
    }

    await refresh();

    // Confirm membership exists before navigating
    const { data: confirmed } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", org.id)
      .eq("accepted", true)
      .limit(1);

    if (!confirmed || confirmed.length === 0) {
      toast({ title: "Something went wrong", description: "Organization membership could not be confirmed.", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Mark onboarding complete
    await supabase.from("profiles").upsert({ user_id: user.id, has_completed_onboarding: true }, { onConflict: "user_id" });

    toast({ title: `Welcome to ${org.name}!`, description: "You now have access to all team projects." });
    setLoading(false);
    navigate("/");
  };

  const cardClass =
    "w-full max-w-md rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl p-8 space-y-6";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          "linear-gradient(135deg, #0D0F35 0%, #1F1B6B 50%, #0B7B6E 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      <div className={cardClass} style={{ background: "rgba(255,255,255,0.07)" }}>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Set Up Your Organization
          </h1>
          <p className="text-sm text-white/50">
            {path === "choose"
              ? "Create a new organization or join an existing one."
              : path === "create"
              ? "Name your organization to get started."
              : "Enter the invite code you received."}
          </p>
        </div>

        {/* ── Choose path ───────────────────────── */}
        {path === "choose" && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setPath("create")}
              className="flex items-center gap-4 rounded-xl border border-white/20 bg-white/5 p-4 text-left text-white hover:bg-white/10 transition-colors"
            >
              <Building2 className="h-6 w-6 text-primary shrink-0" />
              <div>
                <p className="font-semibold text-sm">Create a New Organization</p>
                <p className="text-xs text-white/50">
                  Start fresh and invite your team later.
                </p>
              </div>
            </button>

            <button
              onClick={() => setPath("join")}
              className="flex items-center gap-4 rounded-xl border border-white/20 bg-white/5 p-4 text-left text-white hover:bg-white/10 transition-colors"
            >
              <Users className="h-6 w-6 text-primary shrink-0" />
              <div>
                <p className="font-semibold text-sm">
                  Join an Existing Organization
                </p>
                <p className="text-xs text-white/50">
                  Use an invite code from your team.
                </p>
              </div>
            </button>
          </div>
        )}

        {/* ── Create org ───────────────────────── */}
        {path === "create" && (
          <div className="space-y-4">
            <Input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Organization name"
              className="h-11 rounded-lg border-white/20 bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-primary"
            />
            <Button
              disabled={loading || !orgName.trim()}
              onClick={handleCreate}
              className="w-full h-11 text-sm font-semibold text-white"
            >
              {loading ? "Creating…" : "Create Organization"}
            </Button>
            <button
              type="button"
              onClick={() => setPath("choose")}
              className="block mx-auto text-sm text-primary hover:text-primary/80 transition-colors"
            >
              ← Back
            </button>
          </div>
        )}

        {/* ── Join org ─────────────────────────── */}
        {path === "join" && (
          <div className="space-y-4">
            <Input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Invite code"
              className="h-11 rounded-lg border-white/20 bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-primary"
            />
            <Button
              disabled={loading || !inviteCode.trim()}
              onClick={handleJoin}
              className="w-full h-11 text-sm font-semibold text-white"
            >
              {loading ? "Joining…" : "Join Organization"}
            </Button>
            <button
              type="button"
              onClick={() => setPath("choose")}
              className="block mx-auto text-sm text-primary hover:text-primary/80 transition-colors"
            >
              ← Back
            </button>
          </div>
        )}

        <div className="pt-2 border-t border-white/10 text-center">
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/auth", { replace: true });
            }}
            className="text-xs text-white/40 hover:text-white/60 transition-colors"
          >
            Sign out or use a different account
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
