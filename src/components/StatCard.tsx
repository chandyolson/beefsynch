import { ReactNode } from "react";
import { Calendar, Users, Beef, LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value?: number;
  customContent?: ReactNode;
  subtitle?: string;
  delay?: number;
  index?: number;
  icon?: LucideIcon;
}

const defaultIcons: LucideIcon[] = [Calendar, Users, Beef, Calendar];

const gradients = [
  "linear-gradient(135deg, #102175 0%, #1a3285 100%)",
  "linear-gradient(135deg, #1a3285 0%, #1a5a8a 100%)",
  "linear-gradient(135deg, #1a5a8a 0%, #0d8a8a 100%)",
  "linear-gradient(135deg, #0d8a8a 0%, #0da3a3 100%)",
];

const StatCard = ({ title, value, customContent, subtitle, delay = 0, index = 0, icon }: StatCardProps) => {
  const Icon = icon || defaultIcons[index % defaultIcons.length];

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
        {customContent ? (
          customContent
        ) : (
          <p className="text-3xl font-bold font-display text-white">
            {(value ?? 0).toLocaleString()}
          </p>
        )}
        {subtitle && (
          <p className="text-xs text-white/50 mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
};

export default StatCard;
