import { Calendar, Users, Baby, Beef } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number;
  subtitle?: string;
  delay?: number;
  index?: number;
}

const icons = [Calendar, Users, Baby, Beef];

const gradients = [
  "linear-gradient(135deg, #0F4D52 0%, #1A6B6A 100%)",
  "linear-gradient(135deg, #117A72 0%, #15958A 100%)",
  "linear-gradient(135deg, #14A49A 0%, #18BFB2 100%)",
  "linear-gradient(135deg, #17C9BA 0%, #1DE4D4 100%)",
];

const StatCard = ({ title, value, subtitle, delay = 0, index = 0 }: StatCardProps) => {
  const Icon = icons[index % icons.length];

  return (
    <div
      className="rounded-xl p-5 opacity-0 animate-fade-in relative overflow-hidden min-h-[120px] flex flex-col justify-between"
      style={{
        animationDelay: `${delay}ms`,
        background: gradients[index % gradients.length],
      }}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold tracking-widest uppercase text-white/70">
          {title}
        </p>
        <div className="rounded-lg bg-white/10 p-2">
          <Icon className="h-4 w-4 text-white/60" />
        </div>
      </div>
      <div className="mt-3">
        <p className="text-3xl font-bold font-display text-white">
          {value.toLocaleString()}
        </p>
        {subtitle && (
          <p className="text-xs text-white/50 mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
};

export default StatCard;
