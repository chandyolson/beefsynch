import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import GuestBanner from "@/components/GuestBanner";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const location = useLocation();

  const fetchIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    // Reset onboarding state on every auth change to prevent stale renders
    const handleSession = async (s: Session | null) => {
      const fetchId = ++fetchIdRef.current;
      if (cancelled) return;

      // Reset onboarding check before updating session so the loading
      // spinner shows while we fetch the profile
      setOnboardingChecked(false);
      setNeedsOnboarding(false);
      setSession(s);

      if (!s || s.user.is_anonymous) {
        setOnboardingChecked(true);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("has_completed_onboarding")
        .eq("user_id", s.user.id)
        .maybeSingle();

      console.log("[ProtectedRoute] profile fetch:", { userId: s.user.id, data, error });
      console.log("[ProtectedRoute] has_completed_onboarding:", data?.has_completed_onboarding);

      if (cancelled || fetchId !== fetchIdRef.current) return;

      // Only redirect to onboarding if explicitly false.
      // Treat null, undefined, or fetch errors as "completed" so existing users aren't stuck.
      const onboardingNeeded = data?.has_completed_onboarding === false;
      console.log("[ProtectedRoute] onboardingNeeded:", onboardingNeeded);
      setNeedsOnboarding(onboardingNeeded);
      setOnboardingChecked(true);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      handleSession(s);
    });

    supabase.auth.getSession().then(({ data }) => {
      handleSession(data.session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Still loading session or onboarding check
  if (session === undefined || (session && !session.user.is_anonymous && !onboardingChecked)) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #0D0F35 0%, #1F1B6B 50%, #0B7B6E 100%)" }}
      >
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  if (!needsOnboarding && location.pathname === "/onboarding") {
    return <Navigate to="/" replace />;
  }

  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <>
      <GuestBanner />
      {children}
    </>
  );
};

export default ProtectedRoute;
