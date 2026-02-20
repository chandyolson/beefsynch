import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { List, CalendarDays, Plus, BarChart3, LogOut, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavbarProps {
  onNewProject?: () => void;
}

const Navbar = ({ onNewProject }: NavbarProps) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out", description: "You have been signed out." });
    navigate("/auth");
  };

  return (
    <header className="border-b border-border/50 backdrop-blur-sm">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground tracking-tight">
            Beef<span className="text-primary">Synch</span>
          </h1>
          <p className="text-xs text-muted-foreground tracking-wide">
            Synchronization &amp; Breeding Management
          </p>
        </div>
        <nav className="flex items-center gap-2">
          <button
            onClick={() => navigate("/bulls")}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">Bull List</span>
          </button>
          <button
            onClick={() => navigate("/calendar")}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Calendar</span>
          </button>
          <button
            onClick={() => navigate("/bull-report")}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Bull Report</span>
          </button>
          <button
            onClick={onNewProject}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Project</span>
          </button>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <User className="h-4 w-4 shrink-0" />
                {email && (
                  <span className="hidden md:inline max-w-[160px] truncate">
                    {email}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="z-50 w-56 bg-popover border border-border shadow-lg"
            >
              {email && (
                <div className="px-3 py-2 text-xs text-muted-foreground truncate border-b border-border">
                  {email}
                </div>
              )}
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer gap-2 text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
