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
  "linear-gradient(135deg, #155e6e 0%, #1a7a8a 100%)",
  "linear-gradient(135deg, #1a7a8a 0%, #1f9aaa 100%)",
  "linear-gradient(135deg, #1f9aaa 0%, #14c4cc 100%)",
  "linear-gradient(135deg, #14c4cc 0%, #11eded 100%)",
];

const StatCard = ({ title, value, subtitle, delay = 0, index = 0 }: StatCardProps) => {
  const Icon = icons[index % icons.length];

  return (
    <div
      className="rounded-xl p-5 opacity-0 animate-fade-in relative overflow-hidden min-h-[120px] flex flex-col justify-between"
      style={{
        animationDelay: `${delay}ms`,
        background: gradients[index % gradients.length],
        borderRadius: "12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
      }}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold tracking-widest uppercase text-white/70">
          {title}
        </p>
        <div className="rounded-lg bg-white/5 p-2">
          <Icon className="h-5 w-5 text-white/25" />
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
