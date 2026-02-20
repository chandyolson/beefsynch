import { useNavigate } from "react-router-dom";
import { List, CalendarDays, Plus, BarChart3 } from "lucide-react";

interface NavbarProps {
  onNewProject?: () => void;
}

const Navbar = ({ onNewProject }: NavbarProps) => {
  const navigate = useNavigate();
  return (
    <header className="border-b border-border/50 backdrop-blur-sm">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground tracking-tight">
            Beef<span className="text-primary">Synch</span>
          </h1>
          <p className="text-xs text-muted-foreground tracking-wide">
            Synchronization & Breeding Management
          </p>
        </div>
        <nav className="flex items-center gap-2">
          <button
            onClick={() => navigate("/bulls")}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <List className="h-4 w-4" />
            Bull List
          </button>
          <button
            onClick={() => navigate("/calendar")}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <CalendarDays className="h-4 w-4" />
            Calendar
          </button>
          <button
            onClick={() => navigate("/bull-report")}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <BarChart3 className="h-4 w-4" />
            Bull Report
          </button>
          <button
            onClick={onNewProject}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
