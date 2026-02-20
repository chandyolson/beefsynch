import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  delay?: number;
}

const StatCard = ({ title, value, icon: Icon, delay = 0 }: StatCardProps) => {
  return (
    <div
      className="rounded-lg border border-border bg-card p-5 opacity-0 animate-fade-in"
      style={{
        animationDelay: `${delay}ms`,
        background: "var(--gradient-card)",
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="mt-1 text-3xl font-bold font-display text-foreground">
            {value}
          </p>
        </div>
        <div className="rounded-lg bg-primary/15 p-3">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
    </div>
  );
};

export default StatCard;
