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
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | undefined>(undefined);
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

  // Once we have a session, check org membership (skip for anonymous users)
  useEffect(() => {
    if (!session) {
      setNeedsOnboarding(false);
      return;
    }

    const user = session.user;
    if (user.is_anonymous) {
      setNeedsOnboarding(false);
      return;
    }

    supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .then(({ data }) => {
        setNeedsOnboarding(!data || data.length === 0);
      });
  }, [session]);

  if (session === undefined || (session && needsOnboarding === undefined)) {
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
