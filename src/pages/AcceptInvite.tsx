import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useOrgRole } from "@/hooks/useOrgRole";
import { Button } from "@/components/ui/button";
import { Lock, Eye, EyeOff } from "lucide-react";

function PasswordInput({
  value,
  onChange,
  placeholder = "Password",
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="flex h-11 w-full rounded-lg border border-white/20 bg-white/10 pl-10 pr-10 py-2 text-sm text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 transition-colors"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

type Step = "loading" | "set-password" | "sign-in" | "accepting" | "done" | "error";

const AcceptInvite = () => {
  const navigate = useNavigate();
  const { refresh } = useOrgRole();
  const [step, setStep] = useState<Step>("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Listen for the auth event from the invite link hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session) {
          // Check if this is from an invite (user needs password set) or existing user
          const hash = window.location.hash;
          const isInvite = hash.includes("type=invite") || hash.includes("type=signup") || hash.includes("type=magiclink");

          if (isInvite) {
            // New invited user — needs to set password
            setStep("set-password");
          } else {
            // Already authenticated — just accept the invite
            await acceptInvite(session.user.id, session.user.email ?? "");
          }
        }
      }
    );

    // Check if already has a session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const hash = window.location.hash;
        const isInvite = hash.includes("type=invite") || hash.includes("type=signup") || hash.includes("type=magiclink");
        if (isInvite) {
          setStep("set-password");
        } else {
          // User navigated here directly while logged in — check for pending invite
          acceptInvite(session.user.id, session.user.email ?? "");
        }
      } else {
        // No session and no invite token — show sign in option
        setStep("sign-in");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const acceptInvite = async (userId: string, userEmail: string) => {
    setStep("accepting");

    // Find their pending membership by email
    const { data: membership, error: findError } = await supabase
      .from("organization_members")
      .select("id, organization_id")
      .eq("invited_email", userEmail)
      .eq("accepted", false)
      .limit(1)
      .maybeSingle();

    if (findError || !membership) {
      // No pending invite found — might already be accepted or doesn't exist
      setStep("error");
      setErrorMsg("No pending invitation found for your email. It may have already been accepted.");
      return;
    }

    // Accept the invite
    const { error: updateError } = await supabase
      .from("organization_members")
      .update({ accepted: true, user_id: userId })
      .eq("id", membership.id);

    if (updateError) {
      setStep("error");
      setErrorMsg(updateError.message);
      return;
    }

    // Get org name for the welcome toast
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", membership.organization_id)
      .single();

    const orgName = org?.name ?? "your organization";

    await refresh();

    toast({
      title: `Welcome to ${orgName}!`,
      description: "You now have access to all team projects.",
    });

    setStep("done");
    navigate("/");
  };

  const handleSetPassword = async () => {
    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ title: "Could not set password", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Now accept the invite
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await acceptInvite(user.id, user.email ?? "");
    }
    setLoading(false);
  };

  const cardClass =
    "w-full max-w-md rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl p-8 space-y-6";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #0D0F35 0%, #1F1B6B 50%, #0B7B6E 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      <div className={cardClass} style={{ background: "rgba(255,255,255,0.07)" }}>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Beef<span className="text-primary">Synch</span>
          </h1>
          <p className="text-sm text-white/50">Team Invitation</p>
        </div>

        {/* Loading */}
        {step === "loading" && (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}

        {/* Accepting */}
        {step === "accepting" && (
          <div className="text-center space-y-3 py-4">
            <div className="flex justify-center">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
            <p className="text-sm text-white/70">Joining organization…</p>
          </div>
        )}

        {/* Set Password (new invited user) */}
        {step === "set-password" && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-base font-semibold text-white/80">Set Your Password</p>
              <p className="text-xs text-white/40 mt-1">
                Create a password to complete your account setup.
              </p>
            </div>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
            />
            <Button
              disabled={loading}
              onClick={handleSetPassword}
              className="w-full h-11 text-sm font-semibold text-white"
            >
              {loading ? "Setting up…" : "Set Password & Join Team"}
            </Button>
          </div>
        )}

        {/* Sign In (existing user) */}
        {step === "sign-in" && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-white/70">
              Sign in to your account to accept the team invitation.
            </p>
            <Button
              onClick={() => navigate("/auth")}
              className="w-full h-11 text-sm font-semibold text-white"
            >
              Sign In to Accept
            </Button>
            <p className="text-xs text-white/40">
              Don't have an account? The invitation link in your email will create one automatically.
            </p>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-white/70">{errorMsg}</p>
            <Button
              onClick={() => navigate("/")}
              variant="outline"
              className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
            >
              Go to Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AcceptInvite;
