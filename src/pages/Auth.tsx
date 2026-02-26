import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import beefsynchLogo from "@/assets/beefsynch-logo.png";
import beefsynchBadge from "@/assets/beefsynch-badge.png";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage } from
"@/components/ui/form";

// ── Schemas ────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters")
});

const signupSchema = z.
object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string()
}).
refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});

const forgotSchema = z.object({
  email: z.string().trim().email("Invalid email address")
});

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;
type ForgotValues = z.infer<typeof forgotSchema>;

type Mode = "landing" | "login" | "signup" | "forgot";

// ── Shared password input ────────────────────────────────────────────────
function PasswordInput({ value, onChange, placeholder = "Password", ...rest }: React.ComponentProps<"input">) {
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
        className="flex h-11 w-full rounded-lg border border-white/20 bg-white/10 pl-10 pr-10 py-2 text-sm text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 transition-colors" />

      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
        tabIndex={-1}>

        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>);

}

// ── Auth Page ────────────────────────────────────────────────────────────
const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isConvert = searchParams.get("convert") === "true";
  const [mode, setMode] = useState<Mode>(isConvert ? "signup" : "landing");
  const [loading, setLoading] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setIsAnonymous(user?.is_anonymous === true);
      // If already signed in as a non-anonymous user, redirect away
      // and let ProtectedRoute handle onboarding vs dashboard routing
      if (user && !user.is_anonymous && !isConvert) {
        navigate("/", { replace: true });
      }
    });
  }, [navigate, isConvert]);

  // Login form
  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" }
  });

  // Signup form
  const signupForm = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" }
  });

  // Forgot password form
  const forgotForm = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" }
  });

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleGuestLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInAnonymously();
    setLoading(false);
    if (error) {
      toast({ title: "Guest sign in failed", description: error.message, variant: "destructive" });
    } else {
      navigate("/");
    }
  };

  const handleLogin = async (values: LoginValues) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password
    });
    setLoading(false);
    if (error) {
      toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
    } else {
      navigate("/");
    }
  };

  const handleSignup = async (values: SignupValues) => {
    setLoading(true);

    // Guest conversion: update the existing anonymous user, create org, migrate projects
    if (isAnonymous) {
      const { error } = await supabase.auth.updateUser({
        email: values.email,
        password: values.password,
      });
      if (error) {
        setLoading(false);
        toast({ title: "Account conversion failed", description: error.message, variant: "destructive" });
        return;
      }

      // Auto-create an organization for the converted guest
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const orgName = values.email.split("@")[0] + "'s Organization";
        const { data: org } = await supabase
          .from("organizations")
          .insert({ name: orgName, created_by: user.id })
          .select("id")
          .single();

        if (org) {
          // Add user as owner
          await supabase.from("organization_members").insert({
            user_id: user.id,
            organization_id: org.id,
            role: "owner",
            accepted: true,
          });

          // Migrate all existing guest projects to the new org
          await supabase
            .from("projects")
            .update({ organization_id: org.id })
            .eq("user_id", user.id);
        }
      }

      setLoading(false);
      toast({
        title: "Account created!",
        description: "All your projects have been saved.",
      });
      navigate("/");
      return;
    }

    // Normal signup
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { emailRedirectTo: window.location.origin }
    });
    setLoading(false);
    if (error) {
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Check your email",
        description: "We sent a confirmation link. Click it to activate your account."
      });
      setMode("login");
      signupForm.reset();
    }
  };

  const handleForgot = async (values: ForgotValues) => {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Reset email sent",
        description: "Check your inbox for a password reset link."
      });
      setMode("login");
      forgotForm.reset();
    }
  };

  // ── Shared email field style ─────────────────────────────────────────
  const emailInputClass =
  "flex h-11 w-full rounded-lg border border-white/20 bg-white/10 pl-10 pr-3 py-2 text-sm text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 transition-colors";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #0D0F35 0%, #1F1B6B 50%, #0B7B6E 100%)",
        backgroundAttachment: "fixed"
      }}>

      {/* Card */}
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/8 backdrop-blur-xl shadow-2xl p-8 space-y-7"
      style={{ background: "rgba(255,255,255,0.07)" }}>

        {/* Logo / Branding */}
        <div className="text-center space-y-3">
          
          <h1 className="text-3xl font-bold font-display text-white tracking-tight">
            Beef<span className="text-primary">Synch</span>
          </h1>
          <p className="text-sm text-white/50 tracking-wide">
            Synchronization Planner
          </p>
          
        </div>

        {/* ── Landing Choice Screen ─────────────────────────────────── */}
        {mode === "landing" &&
        <div className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              
              <div className="text-center space-y-1">
                <h2 className="text-xl font-semibold text-white/90">Welcome to BeefSynch</h2>
                
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button
              onClick={() => setMode("login")}
              className="flex-1 h-12 text-sm font-semibold text-white">

                Sign In / Create Account
              </Button>
              <Button
              variant="outline"
              disabled={loading}
              onClick={handleGuestLogin}
              className="flex-1 h-12 text-sm font-semibold border-white/20 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">

                {loading ? "Signing in…" : "Try as Guest"}
              </Button>
            </div>

            <p className="text-center text-xs text-white/40">
              Guest projects are temporary and will not be saved after your session ends.
            </p>
          </div>
        }

        {/* ── Login Form ──────────────────────────────────────────── */}
        {mode === "login" &&
        <Form {...loginForm}>
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <p className="text-center text-base font-semibold text-white/80">Sign In</p>

              <FormField control={loginForm.control} name="email" render={({ field }) =>
            <FormItem>
                  <FormLabel className="text-white/70">Email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                      <Input {...field} type="email" placeholder="you@example.com" className={emailInputClass} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
            } />

              <FormField control={loginForm.control} name="password" render={({ field }) =>
            <FormItem>
                  <FormLabel className="text-white/70">Password</FormLabel>
                  <FormControl>
                    <PasswordInput value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
            } />

              <div className="text-right">
                <button
                type="button"
                onClick={() => {setMode("forgot");loginForm.reset();}}
                className="text-xs text-primary hover:text-primary/80 transition-colors">

                  Forgot Password?
                </button>
              </div>

              <Button type="submit" disabled={loading} className="w-full h-11 text-sm font-semibold text-white">
                {loading ? "Signing in…" : "Sign In"}
              </Button>

              {/* Or divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/20" />
                <span className="text-xs text-white/40">or</span>
                <div className="flex-1 h-px bg-white/20" />
              </div>

              <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={handleGuestLogin}
              className="w-full h-11 text-sm font-semibold border-white/20 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">

                {loading ? "Signing in…" : "Continue as Guest"}
              </Button>

              <p className="text-center text-sm text-white/50">
                Don&apos;t have an account?{" "}
                <button
                type="button"
                onClick={() => {setMode("signup");loginForm.reset();}}
                className="text-primary hover:text-primary/80 font-medium transition-colors">

                  Sign Up
                </button>
              </p>
            </form>
          </Form>
        }

        {/* ── Sign Up Form ─────────────────────────────────────────── */}
        {mode === "signup" &&
        <Form {...signupForm}>
            <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4">
              <p className="text-center text-base font-semibold text-white/80">Create Account</p>

              <FormField control={signupForm.control} name="email" render={({ field }) =>
            <FormItem>
                  <FormLabel className="text-white/70">Email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                      <Input {...field} type="email" placeholder="you@example.com" className={emailInputClass} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
            } />

              <FormField control={signupForm.control} name="password" render={({ field }) =>
            <FormItem>
                  <FormLabel className="text-white/70">Password</FormLabel>
                  <FormControl>
                    <PasswordInput value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
            } />

              <FormField control={signupForm.control} name="confirmPassword" render={({ field }) =>
            <FormItem>
                  <FormLabel className="text-white/70">Confirm Password</FormLabel>
                  <FormControl>
                    <PasswordInput value={field.value} onChange={field.onChange} placeholder="Confirm password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
            } />

              <Button type="submit" disabled={loading} className="w-full h-11 text-sm font-semibold text-white">
                {loading ? "Creating account…" : "Create Account"}
              </Button>

              <p className="text-center text-sm text-white/50">
                Already have an account?{" "}
                <button
                type="button"
                onClick={() => {setMode("login");signupForm.reset();}}
                className="text-primary hover:text-primary/80 font-medium transition-colors">

                  Sign In
                </button>
              </p>
            </form>
          </Form>
        }

        {/* ── Forgot Password Form ─────────────────────────────────── */}
        {mode === "forgot" &&
        <Form {...forgotForm}>
            <form onSubmit={forgotForm.handleSubmit(handleForgot)} className="space-y-4">
              <div className="text-center space-y-1">
                <p className="text-base font-semibold text-white/80">Forgot Password</p>
                <p className="text-xs text-white/40">Enter your email and we&apos;ll send a reset link.</p>
              </div>

              <FormField control={forgotForm.control} name="email" render={({ field }) =>
            <FormItem>
                  <FormLabel className="text-white/70">Email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                      <Input {...field} type="email" placeholder="you@example.com" className={emailInputClass} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
            } />

              <Button type="submit" disabled={loading} className="w-full h-11 text-sm font-semibold">
                {loading ? "Sending…" : "Send Reset Link"}
              </Button>

              <p className="text-center text-sm text-white/50">
                <button
                type="button"
                onClick={() => {setMode("login");forgotForm.reset();}}
                className="text-primary hover:text-primary/80 font-medium transition-colors">

                  ← Back to Sign In
                </button>
              </p>
            </form>
          </Form>
        }
      </div>
    </div>);

};

export default Auth;