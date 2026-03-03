import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// ── Schemas ──────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = z
  .object({
    email: z.string().trim().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;

// ── Password input ───────────────────────────────────────────────────────
function PasswordInput({
  value,
  onChange,
  placeholder = "Password",
  ...rest
}: React.ComponentProps<"input">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
      <input
        {...rest}
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

type Step = "loading" | "invalid" | "auth" | "accepting" | "done";
type AuthTab = "signin" | "signup";

interface InviteData {
  token: string;
  organization_id: string;
  org_name: string;
  invited_email: string;
}

const AcceptInvite = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refresh } = useOrgRole();

  const [step, setStep] = useState<Step>("loading");
  const [authTab, setAuthTab] = useState<AuthTab>("signup");
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const emailInputClass =
    "flex h-11 w-full rounded-lg border border-white/20 bg-white/10 pl-10 pr-3 py-2 text-sm text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 transition-colors";

  // ── Accept invite logic ────────────────────────────────────────────────
  const acceptInvite = useCallback(
    async (userId: string, userEmail: string, inviteData: InviteData) => {
      if (userEmail && inviteData.invited_email && userEmail.toLowerCase() !== inviteData.invited_email.toLowerCase()) {
        toast({ title: "Email mismatch", description: "This invitation was sent to " + inviteData.invited_email + ". Please sign in with that email address to accept it.", variant: "destructive" });
        setStep("auth");
        return;
      }
      setStep("accepting");

      // Step 1 — Mark the invite token as accepted
      const { error: inviteUpdateError } = await supabase
        .from("pending_invites")
        .update({ accepted: true })
        .eq("token", inviteData.token);

      if (inviteUpdateError) {
        console.error("Failed to mark invite accepted:", inviteUpdateError.message);
      }

      // Step 2 — Try to update existing pending org member record by invited_email
      const { data: updatedRows } = await supabase
        .from("organization_members")
        .update({ user_id: userId, accepted: true })
        .eq("organization_id", inviteData.organization_id)
        .eq("invited_email", inviteData.invited_email)
        .eq("accepted", false)
        .select();

      // Step 3 — If no existing record was found, insert a fresh one
      if (!updatedRows || updatedRows.length === 0) {
        const { error: insertError } = await supabase
          .from("organization_members")
          .insert({
            user_id: userId,
            organization_id: inviteData.organization_id,
            role: "member",
            accepted: true,
          });

        if (insertError) {
          console.error("Failed to insert org member:", insertError.message);
          toast({
            title: "Something went wrong",
            description:
              "Could not complete your organization membership. Please contact your organization owner.",
            variant: "destructive",
          });
          setStep("invalid");
          setErrorMsg("Failed to accept invitation.");
          return;
        }
      }

      // Step 4 — Success
      await refresh();

      toast({
        title: `Welcome to ${inviteData.org_name}!`,
        description: "You now have access to all team projects.",
      });

      setStep("done");
      navigate("/");
    },
    [navigate, refresh]
  );

  // ── On load: validate token ────────────────────────────────────────────
  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      navigate("/auth");
      return;
    }

    const validateAndProceed = async () => {
      const { data: invites, error: lookupError } = await supabase
        .rpc("lookup_invite_by_token", { _token: token });

      const invite = invites && invites.length > 0 ? invites[0] : null;

      console.log("Token lookup result:", invite ? "found" : "not found", lookupError?.message ?? "");

      if (lookupError || !invite) {
        setStep("invalid");
        setErrorMsg(
          "This invitation link is invalid or has expired. Please ask your organization owner to send a new invite."
        );
        return;
      }

      const inviteData: InviteData = {
        token: invite.token,
        organization_id: invite.organization_id!,
        org_name: invite.org_name ?? "your organization",
        invited_email: invite.invited_email,
      };
      setInvite(inviteData);

      // Check if user is already logged in
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user && !session.user.is_anonymous) {
        await acceptInvite(
          session.user.id,
          session.user.email ?? "",
          inviteData
        );
      } else {
        setStep("auth");
      }
    };

    validateAndProceed();
  }, [searchParams, navigate, acceptInvite]);

  // ── Auth handlers ──────────────────────────────────────────────────────
  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signupForm = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const handleLogin = async (values: LoginValues) => {
    if (!invite) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (error) {
      setLoading(false);
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    if (data.user) {
      await acceptInvite(data.user.id, data.user.email ?? "", invite);
    }
    setLoading(false);
  };

  const handleSignup = async (values: SignupValues) => {
    if (!invite) return;
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${window.location.origin}/accept-invite?token=${invite.token}`,
      },
    });
    setLoading(false);
    if (error) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Check your email",
        description:
          "We sent a confirmation link. Click it to activate your account and join the team.",
      });
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
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
        {/* Branding */}
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

        {/* Invalid / Expired */}
        {step === "invalid" && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-white/70">{errorMsg}</p>
            <Button
              onClick={() => navigate("/auth")}
              variant="outline"
              className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
            >
              Go to Sign In
            </Button>
          </div>
        )}

        {/* Auth — Sign Up / Sign In tabs */}
        {step === "auth" && invite && (
          <div className="space-y-5">
            <p className="text-center text-sm text-white/70">
              You have been invited to join{" "}
              <span className="font-semibold text-white/90">
                {invite.org_name}
              </span>
              . Create an account or sign in to accept.
            </p>

            {/* Tab buttons */}
            <div className="flex rounded-lg border border-white/20 overflow-hidden">
              <button
                onClick={() => setAuthTab("signup")}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  authTab === "signup"
                    ? "bg-primary text-white"
                    : "bg-white/5 text-white/50 hover:text-white/70"
                }`}
              >
                Sign Up
              </button>
              <button
                onClick={() => setAuthTab("signin")}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  authTab === "signin"
                    ? "bg-primary text-white"
                    : "bg-white/5 text-white/50 hover:text-white/70"
                }`}
              >
                Sign In
              </button>
            </div>

            {/* Sign Up form */}
            {authTab === "signup" && (
              <Form {...signupForm}>
                <form
                  onSubmit={signupForm.handleSubmit(handleSignup)}
                  className="space-y-4"
                >
                  <FormField
                    control={signupForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/70">Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                            <Input
                              {...field}
                              type="email"
                              placeholder="you@example.com"
                              className={emailInputClass}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signupForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/70">
                          Password
                        </FormLabel>
                        <FormControl>
                          <PasswordInput
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signupForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/70">
                          Confirm Password
                        </FormLabel>
                        <FormControl>
                          <PasswordInput
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Confirm password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 text-sm font-semibold text-white"
                  >
                    {loading ? "Creating account…" : "Create Account"}
                  </Button>
                </form>
              </Form>
            )}

            {/* Sign In form */}
            {authTab === "signin" && (
              <Form {...loginForm}>
                <form
                  onSubmit={loginForm.handleSubmit(handleLogin)}
                  className="space-y-4"
                >
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/70">Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                            <Input
                              {...field}
                              type="email"
                              placeholder="you@example.com"
                              className={emailInputClass}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/70">
                          Password
                        </FormLabel>
                        <FormControl>
                          <PasswordInput
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 text-sm font-semibold text-white"
                  >
                    {loading ? "Signing in…" : "Sign In & Accept Invite"}
                  </Button>
                </form>
              </Form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AcceptInvite;
