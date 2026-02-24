import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import type { Session } from "@supabase/supabase-js";
import GuestBanner from "@/components/GuestBanner";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const { loading: orgLoading, userOrgs } = useOrgRole();
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

  // Still loading session
  if (session === undefined) {
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

  // Anonymous users skip onboarding check
  const isAnonymous = session.user.is_anonymous;

  // Wait for org role context to finish loading before deciding onboarding
  if (!isAnonymous && orgLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #0D0F35 0%, #1F1B6B 50%, #0B7B6E 100%)" }}
      >
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const needsOnboarding = !isAnonymous && userOrgs.length === 0;

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
