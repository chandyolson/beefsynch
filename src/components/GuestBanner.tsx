import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { X, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

const GuestBanner = () => {
  const navigate = useNavigate();
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAnonymous(data.session?.user?.is_anonymous === true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAnonymous(session?.user?.is_anonymous === true);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!isAnonymous || dismissed) return null;

  return (
    <div className="bg-primary/90 text-primary-foreground px-4 py-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
      <span>
        You are using BeefSynch as a guest. Your projects will not be saved permanently. Create a free account to save your work.
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-semibold text-white"
          onClick={() => navigate("/auth?convert=true")}
        >
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          Create Account
        </Button>
        <button
          onClick={() => setDismissed(true)}
          className="text-primary-foreground/70 hover:text-primary-foreground transition-colors p-1"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default GuestBanner;
