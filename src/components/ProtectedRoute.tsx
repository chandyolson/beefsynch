import { useEffect, useState } from "react";
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Check onboarding status from profiles table
  useEffect(() => {
    if (!session || session.user.is_anonymous) {
      setOnboardingChecked(true);
      setNeedsOnboarding(false);
      return;
    }

    const checkOnboarding = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("has_completed_onboarding")
        .eq("user_id", session.user.id)
        .single();

      setNeedsOnboarding(!data?.has_completed_onboarding);
      setOnboardingChecked(true);
    };

    checkOnboarding();
  }, [session]);

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
