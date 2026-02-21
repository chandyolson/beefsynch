import { ReactNode } from "react";
import { Calendar, Users, Beef, LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value?: number | string;
  breakdown?: ReactNode;
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

const StatCard = ({ title, value, breakdown, delay = 0, index = 0, icon }: StatCardProps) => {
  const Icon = icon || defaultIcons[index % defaultIcons.length];

  return (
    <div
      className="opacity-0 animate-fade-in relative overflow-hidden flex flex-col justify-between"
      style={{
        animationDelay: `${delay}ms`,
        background: gradients[index % gradients.length],
        borderRadius: "12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        padding: "16px",
      }}
    >
      <Icon className="absolute top-3 right-3 h-7 w-7 text-white/20" />
      <p style={{ fontSize: "10px", letterSpacing: "0.1em" }} className="font-semibold uppercase text-white/70">
        {title}
      </p>
      <p style={{ fontSize: "28px" }} className="font-bold font-display text-white leading-tight mt-1">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {breakdown && (
        <div className="mt-1 space-y-0.5" style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)" }}>
          {breakdown}
        </div>
      )}
    </div>
  );
};

export default StatCard;
