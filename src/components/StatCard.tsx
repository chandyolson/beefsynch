

interface StatCardProps {
  title: string;
  value: number;
  delay?: number;
}

const StatCard = ({ title, value, delay = 0 }: StatCardProps) => {
  return (
    <div
      className="rounded-lg border border-border bg-card p-5 opacity-0 animate-fade-in"
      style={{
        animationDelay: `${delay}ms`,
        background: "var(--gradient-card)",
      }}
    >
      <p className="text-sm text-muted-foreground font-medium">{title}</p>
      <p className="mt-1 text-3xl font-bold font-display text-foreground">
        {value}
      </p>
    </div>
  );
};

export default StatCard;
