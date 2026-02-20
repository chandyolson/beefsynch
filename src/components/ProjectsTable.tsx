import { useState, useMemo } from "react";
import { BreedingProject } from "@/data/mockData";
import { ArrowUpDown, Search, Filter } from "lucide-react";
import { format, parseISO } from "date-fns";

interface ProjectsTableProps {
  projects: BreedingProject[];
}

type SortKey = keyof BreedingProject;
type SortDir = "asc" | "desc";

const statusStyles: Record<string, string> = {
  Active: "bg-primary/20 text-primary",
  Completed: "bg-success/20 text-success",
  Scheduled: "bg-warning/20 text-warning",
};

const typeStyles: Record<string, string> = {
  Heifer: "bg-info/20 text-info",
  Cow: "bg-accent/20 text-accent",
};

const ProjectsTable = ({ projects }: ProjectsTableProps) => {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("All");
  const [sortKey, setSortKey] = useState<SortKey>("startDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    let list = projects;
    if (filterType !== "All") {
      list = list.filter((p) => p.animalType === filterType);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.protocol.toLowerCase().includes(s) ||
          p.location.toLowerCase().includes(s)
      );
    }
    return [...list].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDir === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [projects, search, filterType, sortKey, sortDir]);

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: "Project Name" },
    { key: "animalType", label: "Type" },
    { key: "protocol", label: "Protocol" },
    { key: "headCount", label: "Head" },
    { key: "startDate", label: "Start Date" },
    { key: "breedDate", label: "Breed Date" },
    { key: "status", label: "Status" },
    { key: "location", label: "Location" },
  ];

  return (
    <div className="rounded-lg border border-border bg-card opacity-0 animate-fade-in" style={{ animationDelay: "400ms", background: "var(--gradient-card)" }}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-border">
        <h2 className="text-lg font-semibold font-display text-foreground">Breeding Projects</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-md border border-border bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-secondary p-0.5">
            <Filter className="ml-2 h-4 w-4 text-muted-foreground" />
            {["All", "Heifer", "Cow"].map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  filterType === t
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="cursor-pointer px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((project) => (
              <tr
                key={project.id}
                className="border-b border-border/50 hover:bg-secondary/50 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 font-medium text-foreground">{project.name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${typeStyles[project.animalType]}`}>
                    {project.animalType}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{project.protocol}</td>
                <td className="px-4 py-3 font-semibold text-foreground">{project.headCount}</td>
                <td className="px-4 py-3 text-muted-foreground">{format(parseISO(project.startDate), "MMM d, yyyy")}</td>
                <td className="px-4 py-3 text-muted-foreground">{format(parseISO(project.breedDate), "MMM d, yyyy")}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[project.status]}`}>
                    {project.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{project.location}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No projects found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProjectsTable;
