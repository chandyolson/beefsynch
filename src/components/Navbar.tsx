import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { List, CalendarDays, Plus, BarChart3, LogOut, User, Menu, X } from "lucide-react";
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

const navBtnClass =
  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors w-full md:w-auto";

const Navbar = ({ onNewProject }: NavbarProps) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const go = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  return (
    <header className="border-b border-border/50 backdrop-blur-sm">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        {/* Logo */}
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground tracking-tight">
            Beef<span className="text-primary">Synch</span>
          </h1>
          <p className="text-xs text-muted-foreground tracking-wide">
            Synchronization &amp; Breeding Management
          </p>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-2">
          <button onClick={() => go("/bulls")} className={navBtnClass}>
            <List className="h-4 w-4" /> Bull List
          </button>
          <button onClick={() => go("/calendar")} className={navBtnClass}>
            <CalendarDays className="h-4 w-4" /> Calendar
          </button>
          <button onClick={() => go("/bull-report")} className={navBtnClass}>
            <BarChart3 className="h-4 w-4" /> Bull Report
          </button>
          <button
            onClick={() => { onNewProject?.(); setMobileOpen(false); }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <User className="h-4 w-4 shrink-0" />
                {email && (
                  <span className="hidden lg:inline max-w-[160px] truncate">{email}</span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-50 w-56 bg-popover border border-border shadow-lg">
              {email && (
                <div className="px-3 py-2 text-xs text-muted-foreground truncate border-b border-border">{email}</div>
              )}
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* Mobile hamburger toggle */}
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown panel */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/50 bg-popover/95 backdrop-blur-md px-4 py-3 space-y-1 animate-fade-in">
          <button onClick={() => go("/bulls")} className={navBtnClass}>
            <List className="h-4 w-4" /> Bull List
          </button>
          <button onClick={() => go("/calendar")} className={navBtnClass}>
            <CalendarDays className="h-4 w-4" /> Calendar
          </button>
          <button onClick={() => go("/bull-report")} className={navBtnClass}>
            <BarChart3 className="h-4 w-4" /> Bull Report
          </button>
          <button
            onClick={() => { onNewProject?.(); setMobileOpen(false); }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors w-full"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>
          <div className="border-t border-border/50 pt-2 mt-2 space-y-1">
            {email && (
              <div className="px-3 py-1 text-xs text-muted-foreground truncate">{email}</div>
            )}
            <button onClick={handleSignOut} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-secondary transition-colors w-full">
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
