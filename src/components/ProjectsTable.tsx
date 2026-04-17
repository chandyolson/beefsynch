import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BreedingProject } from "@/data/mockData";
import { ArrowUpDown, Search, Filter, CalendarCheck } from "lucide-react";
import ClickableRegNumber from "@/components/ClickableRegNumber";
import { format, parseISO } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getBadgeClass } from "@/lib/badgeStyles";

interface ProjectsTableProps {
  projects: BreedingProject[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  bullsByProject?: Record<string, { name: string; units: number; registrationNumber?: string; breed?: string }[]>;
  syncedProjectIds?: Set<string>;
  canEditAll?: boolean;
  currentUserId?: string | null;
}

type SortKey = keyof BreedingProject;
type SortDir = "asc" | "desc";

// calendar-sync indicator v4
const ProjectsTable = ({ projects, selectedIds, onSelectionChange, bullsByProject = {}, syncedProjectIds = new Set(), canEditAll = false, currentUserId = null }: ProjectsTableProps) => {
  const navigate = useNavigate();

  const canSelectProject = (_project: BreedingProject) => {
    return true;
  };
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [sortKey, setSortKey] = useState<SortKey>("startDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedBulls, setExpandedBulls] = useState<Set<string>>(new Set());

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
    if (filterStatus !== "All") {
      list = list.filter((p) => p.status === filterStatus);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.protocol.toLowerCase().includes(s)
      );
    }
    return [...list].sort((a, b) => {
      // Complete projects always sort to the bottom
      const aComplete = a.status === "Complete" ? 1 : 0;
      const bComplete = b.status === "Complete" ? 1 : 0;
      if (aComplete !== bComplete) return aComplete - bComplete;

      // Within the same group, sort by active column
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (sortKey === "lastContactedDate") {
        const aStr = (aVal as string) || "";
        const bStr = (bVal as string) || "";
        if (!aStr && !bStr) return 0;
        if (!aStr) return sortDir === "asc" ? -1 : 1;
        if (!bStr) return sortDir === "asc" ? 1 : -1;
        return sortDir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDir === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [projects, search, filterType, filterStatus, sortKey, sortDir]);

  const filteredIds = useMemo(() => new Set(filtered.map((p) => p.id)), [filtered]);
  const selectableFiltered = useMemo(() => filtered.filter(canSelectProject), [filtered, canEditAll, currentUserId]);
  const allVisibleSelected = selectableFiltered.length > 0 && selectableFiltered.every((p) => selectedIds.has(p.id));

  const toggleAll = () => {
    if (allVisibleSelected) {
      const next = new Set(selectedIds);
      selectableFiltered.forEach((p) => next.delete(p.id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      selectableFiltered.forEach((p) => next.add(p.id));
      onSelectionChange(next);
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const renderBulls = (projectId: string) => {
    const bulls = bullsByProject[projectId] || [];
    if (bulls.length === 0) return <span className="text-muted-foreground">—</span>;
    const isExpanded = expandedBulls.has(projectId);
    const visible = isExpanded ? bulls : bulls.slice(0, 2);
    const remaining = bulls.length - 2;
    return (
      <div className="space-y-0.5">
        {visible.map((b, i) => (
          <div key={i} className="text-xs text-foreground whitespace-nowrap flex items-center gap-1">
            <span>{b.name} ({b.units} units)</span>
            {b.registrationNumber && (
              <ClickableRegNumber registrationNumber={b.registrationNumber} breed={b.breed} />
            )}
          </div>
        ))}
        {!isExpanded && remaining > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpandedBulls((prev) => new Set(prev).add(projectId)); }}
            className="text-xs text-primary hover:underline"
          >
            +{remaining} more
          </button>
        )}
        {isExpanded && bulls.length > 2 && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpandedBulls((prev) => { const n = new Set(prev); n.delete(projectId); return n; }); }}
            className="text-xs text-primary hover:underline"
          >
            Show less
          </button>
        )}
      </div>
    );
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: "Project Name" },
    { key: "animalType", label: "Type" },
    { key: "protocol", label: "Protocol" },
    { key: "headCount", label: "Head" },
    { key: "startDate", label: "Start Date" },
    { key: "breedDate", label: "Breed Date" },
    { key: "status", label: "Status" },
    { key: "lastContactedDate", label: "Last Contact" },
  ];

  return (
    <div className="rounded-lg border border-border bg-card opacity-0 animate-fade-in" style={{ animationDelay: "400ms", background: "var(--gradient-card)" }}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-border">
        <h2 className="text-lg font-semibold font-display text-foreground">Breeding Projects</h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
          <div className="flex items-center gap-1 rounded-md border border-border bg-secondary p-0.5">
            {["All", "Tentative", "Confirmed", "Complete"].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  filterStatus === s
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Desktop table ── */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 w-10">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Bulls &amp; Units
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((project) => (
              <tr
                key={project.id}
                onClick={() => navigate(`/project/${project.id}`)}
                className="border-b border-border/50 hover:bg-secondary/50 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  {canSelectProject(project) ? (
                    <Checkbox
                      checked={selectedIds.has(project.id)}
                      onCheckedChange={() => toggleOne(project.id)}
                      aria-label={`Select ${project.name}`}
                    />
                  ) : <div className="w-4" />}
                </td>
                <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {project.name}
                    {syncedProjectIds.has(project.id) && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <CalendarCheck className="h-3.5 w-3.5 text-primary" />
                          </TooltipTrigger>
                          <TooltipContent>Synced to Google Calendar</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getBadgeClass('projectType', project.animalType)}`}>
                    {project.animalType}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{project.protocol}</td>
                <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">{project.headCount}</td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{project.startDate ? format(parseISO(project.startDate), "MMM d, yyyy") : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{project.breedDate ? format(parseISO(project.breedDate), "MMM d, yyyy") : "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getBadgeClass('projectStatus', project.status)}`}>
                    {project.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {project.lastContactedDate ? format(parseISO(project.lastContactedDate), "MMM d") : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{renderBulls(project.id)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  No projects found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Mobile card view ── */}
      <div className="lg:hidden divide-y divide-border">
        {filtered.map((project) => (
          <div
            key={project.id}
            onClick={() => navigate(`/project/${project.id}`)}
            className="p-4 hover:bg-secondary/50 transition-colors cursor-pointer active:bg-secondary/70 space-y-2"
          >
            <div className="flex items-center gap-3">
              <div onClick={(e) => e.stopPropagation()}>
                {canSelectProject(project) ? (
                  <Checkbox
                    checked={selectedIds.has(project.id)}
                    onCheckedChange={() => toggleOne(project.id)}
                    aria-label={`Select ${project.name}`}
                  />
                ) : <div className="w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate pr-2 inline-flex items-center gap-1.5">
                  {project.name}
                  {syncedProjectIds.has(project.id) && (
                    <CalendarCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </h3>

                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getBadgeClass('projectType', project.animalType)}`}>
                    {project.animalType}
                  </span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getBadgeClass('projectStatus', project.status)}`}>
                    {project.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{project.protocol}</span>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span className="font-medium text-foreground">{project.headCount} head</span>
                  <span>Breed: {project.breedDate ? format(parseISO(project.breedDate), "MMM d, yyyy") : "—"}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
                  <span>Last Contact: {project.lastContactedDate ? format(parseISO(project.lastContactedDate), "MMM d") : "—"}</span>
                </div>

                <div className="mt-1">{renderBulls(project.id)}</div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">
            No projects found.
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectsTable;
