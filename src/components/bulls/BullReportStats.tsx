import StatCard from "@/components/StatCard";

interface BullReportStatsProps {
  totalBulls: number;
  totalUnits: number;
  totalProjects: number;
  totalHead: number;
  dataSource: "all" | "projects" | "orders";
}

export default function BullReportStats({
  totalBulls,
  totalUnits,
  totalProjects,
  totalHead,
  dataSource,
}: BullReportStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard title="Total Bulls in Use" value={totalBulls} delay={0} />
      <StatCard title="Total Semen Units" value={totalUnits} delay={100} />
      <StatCard
        title={
          dataSource === "orders"
            ? "Total Orders"
            : dataSource === "projects"
              ? "Total Projects"
              : "Total Projects/Orders"
        }
        value={totalProjects}
        delay={200}
      />
      <StatCard title="Total Head in Range" value={totalHead} delay={300} />
    </div>
  );
}
