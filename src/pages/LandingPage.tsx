import { Link } from "react-router-dom";
import { Calendar, ClipboardList, BookOpen, CalendarSync } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppFooter from "@/components/AppFooter";

const features = [
  {
    icon: ClipboardList,
    title: "Breeding Project Scheduling",
    desc: "Plan and track synchronization protocols with automatic event scheduling for every step.",
  },
  {
    icon: BookOpen,
    title: "Semen Order Tracking",
    desc: "Manage bull assignments and unit counts across all your breeding projects in one place.",
  },
  {
    icon: Calendar,
    title: "Bull Catalog & Reports",
    desc: "Browse the shared bull catalog, generate PDF reports, and export data for your records.",
  },
  {
    icon: CalendarSync,
    title: "Google Calendar Sync",
    desc: "Push breeding schedule events directly to Google Calendar so your whole team stays on track.",
  },
];

const LandingPage = () => (
  <div className="min-h-screen flex flex-col bg-background text-foreground">
    {/* Top bar */}
    <header className="border-b border-border/50">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <h1 className="text-2xl font-bold font-display tracking-tight">
          Beef<span className="text-primary">Synch</span>
        </h1>
        <Link to="/auth">
          <Button variant="outline" size="sm">Sign In</Button>
        </Link>
      </div>
    </header>

    {/* Hero */}
    <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
      <h2 className="text-4xl md:text-5xl font-bold font-display tracking-tight max-w-2xl leading-tight">
        Synchronization &amp; Breeding Management
      </h2>
      <p className="mt-4 text-lg text-muted-foreground max-w-xl">
        Manage breeding projects, synchronization schedules, semen orders, and bull selection — all in one place.
      </p>
      <Link to="/auth" className="mt-8">
        <Button size="lg" className="text-base px-8">Get Started</Button>
      </Link>
    </section>

    {/* Features */}
    <section className="border-t border-border/50 bg-muted/30">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {features.map((f) => (
            <div key={f.title} className="flex gap-4">
              <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{f.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    <AppFooter />
  </div>
);

export default LandingPage;
