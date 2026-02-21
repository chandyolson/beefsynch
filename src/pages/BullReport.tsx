import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import StatCard from "@/components/StatCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Search,
  FileDown,
  BarChart3,
  Mail,
  Download,
} from "lucide-react";
import { format, startOfYear, endOfYear } from "date-fns";
import { generateBullReportPdf, BullReportRow } from "@/lib/generateBullReportPdf";
import ClickableRegNumber from "@/components/ClickableRegNumber";

const PROTOCOLS = [
  "Select Synch CIDR",
  "Select Synch TOO",
  "Select Synch",
  "7&7 Synch",
  "7 Day CIDR",
  "MGA",
  "14 Day CIDR",
];

const COMPANIES = ["ABS", "ST Genetics", "Select Sires", "Genex"];

const COMPANY_BADGE: Record<string, string> = {
  ABS: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "ST Genetics": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Select Sires": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Genex: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

type SortKey = "bullName" | "totalUnits" | "projectCount";
type SortDir = "asc" | "desc";

const thisYear = new Date();
const DEFAULT_FROM = format(startOfYear(thisYear), "yyyy-MM-dd");
const DEFAULT_TO = format(endOfYear(thisYear), "yyyy-MM-dd");

interface ProjectBullJoin {
  units: number;
  custom_bull_name: string | null;
  bull_catalog_id: string | null;
  bulls_catalog: {
    bull_name: string;
    company: string;
    registration_number: string;
    breed: string;
  } | null;
  project_id: string;
  projects: {
    id: string;
    name: string;
    breeding_date: string | null;
    cattle_type: string;
    protocol: string;
    head_count: number;
    status: string;
  } | null;
}

const BullReport = () => {
  const navigate = useNavigate();

  // Filters
  const [fromDate, setFromDate] = useState(DEFAULT_FROM);
  const [toDate, setToDate] = useState(DEFAULT_TO);
  const [cattleType, setCattleType] = useState("All");
  const [protocol, setProtocol] = useState("All Protocols");
  const [company, setCompany] = useState("All Companies");
  const [breed, setBreed] = useState("All Breeds");
  const [search, setSearch] = useState("");
  const [hasRun, setHasRun] = useState(false);

  // Applied (committed) filters
  const [appliedFrom, setAppliedFrom] = useState(DEFAULT_FROM);
  const [appliedTo, setAppliedTo] = useState(DEFAULT_TO);
  const [appliedCattle, setAppliedCattle] = useState("All");
  const [appliedProtocol, setAppliedProtocol] = useState("All Protocols");
  const [appliedCompany, setAppliedCompany] = useState("All Companies");
  const [appliedBreed, setAppliedBreed] = useState("All Breeds");
  const [appliedSearch, setAppliedSearch] = useState("");

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("totalUnits");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Share dialog
  const [shareOpen, setShareOpen] = useState(false);
  const [pdfRows, setPdfRows] = useState<BullReportRow[]>([]);

  // Fetch distinct breeds for filter
  const { data: breeds = [] } = useQuery({
    queryKey: ["breeds_distinct"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulls_catalog")
        .select("breed")
        .order("breed");
      if (error) throw error;
      const set = new Set((data ?? []).map((d) => d.breed));
      return [...set].sort();
    },
  });

  const { data: rawRows = [], isLoading, refetch } = useQuery({
    queryKey: ["bull_report", appliedFrom, appliedTo, appliedCattle, appliedProtocol, appliedCompany],
    queryFn: async () => {
      let query = supabase
        .from("project_bulls")
        .select(`
          units,
          custom_bull_name,
          bull_catalog_id,
          project_id,
          bulls_catalog (bull_name, company, registration_number, breed),
          projects!inner (id, name, breeding_date, cattle_type, protocol, head_count, status)
        `);

      if (appliedFrom) {
        query = query.gte("projects.breeding_date", appliedFrom);
      }
      if (appliedTo) {
        query = query.lte("projects.breeding_date", appliedTo);
      }
      if (appliedCattle !== "All") {
        query = query.eq("projects.cattle_type", appliedCattle);
      }
      if (appliedProtocol !== "All Protocols") {
        query = query.eq("projects.protocol", appliedProtocol);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ProjectBullJoin[];
    },
    enabled: hasRun,
  });

  // Group by bull
  const reportRows = useMemo(() => {
    const map = new Map<string, BullReportRow & { projectIds: Set<string>; headSet: Map<string, number> }>();

    for (const row of rawRows) {
      const proj = row.projects;
      if (!proj) continue;

      // Determine bull key
      const isCatalog = !!row.bull_catalog_id && !!row.bulls_catalog;
      const key = isCatalog
        ? `catalog_${row.bull_catalog_id}`
        : `custom_${row.custom_bull_name ?? "unknown"}`;

      const bullName = isCatalog
        ? row.bulls_catalog!.bull_name
        : row.custom_bull_name ?? "Unknown";
      const co = isCatalog ? row.bulls_catalog!.company : "";
      const regNum = isCatalog ? row.bulls_catalog!.registration_number : "";
      const breed = isCatalog ? row.bulls_catalog!.breed : "";

      // Company filter
      if (appliedCompany !== "All Companies" && co !== appliedCompany) continue;

      // Breed filter
      if (appliedBreed !== "All Breeds" && breed !== appliedBreed) continue;

      // Search filter
      const q = appliedSearch.toLowerCase();
      if (q && !bullName.toLowerCase().includes(q) && !proj.name.toLowerCase().includes(q)) continue;

      if (!map.has(key)) {
        map.set(key, {
          bullName,
          company: co,
          registrationNumber: regNum,
          breed,
          totalUnits: 0,
          projectCount: 0,
          projectNames: "",
          breedingDates: "",
          cattleTypes: "",
          projectIds: new Set(),
          headSet: new Map(),
        });
      }

      const entry = map.get(key)!;
      entry.totalUnits += row.units;

      if (!entry.projectIds.has(proj.id)) {
        entry.projectIds.add(proj.id);
        entry.headSet.set(proj.id, proj.head_count);
      }
    }

    // Finalize — collect project meta in a second pass
    const projectMeta = new Map<string, { name: string; breedingDate: string | null; cattleType: string }>();
    for (const row of rawRows) {
      const proj = row.projects;
      if (proj && !projectMeta.has(proj.id)) {
        projectMeta.set(proj.id, {
          name: proj.name,
          breedingDate: proj.breeding_date,
          cattleType: proj.cattle_type,
        });
      }
    }

    // We need to rebuild so project names/dates are tied per bull
    const bullProjects = new Map<string, Set<string>>();
    for (const row of rawRows) {
      const proj = row.projects;
      if (!proj) continue;
      const isCatalog = !!row.bull_catalog_id && !!row.bulls_catalog;
      const key = isCatalog
        ? `catalog_${row.bull_catalog_id}`
        : `custom_${row.custom_bull_name ?? "unknown"}`;
      if (!bullProjects.has(key)) bullProjects.set(key, new Set());
      bullProjects.get(key)!.add(proj.id);
    }

    const result: BullReportRow[] = [];
    for (const [key, entry] of map.entries()) {
      const projIds = bullProjects.get(key) ?? new Set<string>();
      const names: string[] = [];
      const dates: string[] = [];
      const types = new Set<string>();

      for (const pid of projIds) {
        const meta = projectMeta.get(pid);
        if (!meta) continue;

        // Re-apply filters per project for this bull
        const q = appliedSearch.toLowerCase();
        if (q && !entry.bullName.toLowerCase().includes(q) && !meta.name.toLowerCase().includes(q)) continue;

        names.push(meta.name);
        if (meta.breedingDate) {
          dates.push(format(new Date(meta.breedingDate + "T00:00:00"), "M/d/yyyy"));
        }
        types.add(meta.cattleType);
      }

      entry.projectCount = names.length;
      if (entry.projectCount === 0) continue;

      result.push({
        bullName: entry.bullName,
        company: entry.company,
        registrationNumber: entry.registrationNumber,
        breed: entry.breed,
        totalUnits: entry.totalUnits,
        projectCount: entry.projectCount,
        projectNames: names.join(", "),
        breedingDates: dates.join(", "),
        cattleTypes: [...types].join(", "),
      });
    }

    // Sort
    result.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortKey === "bullName") {
        av = a.bullName.toLowerCase();
        bv = b.bullName.toLowerCase();
      } else if (sortKey === "totalUnits") {
        av = a.totalUnits;
        bv = b.totalUnits;
      } else {
        av = a.projectCount;
        bv = b.projectCount;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [rawRows, appliedSearch, appliedCompany, appliedBreed, sortKey, sortDir]);

  // Stats
  const stats = useMemo(() => {
    const projectIds = new Set<string>();
    let totalHead = 0;
    const projectMeta = new Map<string, { head_count: number }>();

    for (const row of rawRows) {
      if (row.projects && !projectMeta.has(row.projects.id)) {
        projectMeta.set(row.projects.id, { head_count: row.projects.head_count });
      }
    }

    // Filter by company/search for stats too
    const filteredReportIds = new Set(reportRows.flatMap((r) => r.projectNames.split(", ")));

    for (const row of rawRows) {
      if (!row.projects) continue;
      const bull = row.bulls_catalog;
      const bullName = bull ? bull.bull_name : row.custom_bull_name ?? "";
      const co = bull ? bull.company : "";
      const br = bull ? bull.breed : "";
      const q = appliedSearch.toLowerCase();
      if (appliedCompany !== "All Companies" && co !== appliedCompany) continue;
      if (appliedBreed !== "All Breeds" && br !== appliedBreed) continue;
      if (q && !bullName.toLowerCase().includes(q) && !row.projects.name.toLowerCase().includes(q)) continue;
      projectIds.add(row.projects.id);
    }

    for (const pid of projectIds) {
      const meta = projectMeta.get(pid);
      if (meta) totalHead += meta.head_count;
    }

    return {
      totalBulls: reportRows.length,
      totalUnits: reportRows.reduce((s, r) => s + r.totalUnits, 0),
      totalProjects: projectIds.size,
      totalHead,
    };
  }, [reportRows, rawRows, appliedSearch, appliedCompany, appliedBreed]);

  const handleGenerate = () => {
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
    setAppliedCattle(cattleType);
    setAppliedProtocol(protocol);
    setAppliedCompany(company);
    setAppliedBreed(breed);
    setAppliedSearch(search);
    setHasRun(true);
  };

  const handleReset = () => {
    setFromDate(DEFAULT_FROM);
    setToDate(DEFAULT_TO);
    setCattleType("All");
    setProtocol("All Protocols");
    setCompany("All Companies");
    setBreed("All Breeds");
    setSearch("");
    setAppliedFrom(DEFAULT_FROM);
    setAppliedTo(DEFAULT_TO);
    setAppliedCattle("All");
    setAppliedProtocol("All Protocols");
    setAppliedCompany("All Companies");
    setAppliedBreed("All Breeds");
    setAppliedSearch("");
    setHasRun(false);
  };

  const handleExportCsv = () => {
    const headers = ["Bull Name", "Registration Number", "Company", "Breed", "Units Committed", "Project Count", "Project Names", "Breeding Dates", "Cattle Type"];
    const escape = (v: string | number) => {
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.map(escape).join(","),
      ...reportRows.map((r) =>
        [r.bullName, r.registrationNumber, r.company, r.breed, r.totalUnits, r.projectCount, r.projectNames, r.breedingDates, r.cattleTypes]
          .map(escape)
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BeefSynch_Bull_Report_${appliedFrom}_to_${appliedTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    setPdfRows(reportRows);
    generateBullReportPdf(reportRows, stats, {
      fromDate: appliedFrom,
      toDate: appliedTo,
      cattleType: appliedCattle,
      protocol: appliedProtocol,
      company: appliedCompany,
      search: appliedSearch,
    });
    setShareOpen(true);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="ml-1 text-muted-foreground/40">↕</span>;
    return sortDir === "asc" ? (
      <ArrowUp className="inline h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="inline h-3 w-3 ml-1" />
    );
  };

  const fromLabel = appliedFrom ? format(new Date(appliedFrom + "T00:00:00"), "MMM d, yyyy") : "";
  const toLabel = appliedTo ? format(new Date(appliedTo + "T00:00:00"), "MMM d, yyyy") : "";
  const emailSubject = encodeURIComponent(`BeefSynch Bull Report — ${fromLabel} to ${toLabel}`);
  const emailBody = encodeURIComponent(
    `Please find attached the BeefSynch Bull Report for breeding dates ${fromLabel} to ${toLabel}.`
  );

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-2xl font-bold font-display text-foreground tracking-tight">
                Bull Report
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Semen usage across projects by date range
              </p>
            </div>
            {hasRun && reportRows.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs text-muted-foreground font-normal">
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white text-gray-900 border z-50">
                  <DropdownMenuItem onClick={handleExportCsv} className="cursor-pointer gap-2">
                    <FileDown className="h-4 w-4" />
                    Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExport} className="cursor-pointer gap-2">
                    <FileDown className="h-4 w-4" />
                    Export PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Stat Cards */}
        {hasRun && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Bulls in Use" value={stats.totalBulls} delay={0} />
            <StatCard title="Total Semen Units" value={stats.totalUnits} delay={100} />
            <StatCard title="Total Projects in Range" value={stats.totalProjects} delay={200} />
            <StatCard title="Total Head in Range" value={stats.totalHead} delay={300} />
          </div>
        )}

        {/* Filters */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            {/* Date Range */}
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">From</label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 text-xs bg-white text-gray-900 border-border"
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">To</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 text-xs bg-white text-gray-900 border-border"
              />
            </div>

            {/* Cattle Type */}
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Cattle Type</label>
              <div className="flex rounded-md border border-border overflow-hidden h-8">
                {["All", "Heifers", "Cows"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setCattleType(type)}
                    className={`flex-1 text-xs font-medium transition-colors ${
                      cattleType === type
                        ? "bg-primary text-primary-foreground"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Protocol */}
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Protocol</label>
              <Select value={protocol} onValueChange={setProtocol}>
                <SelectTrigger className="h-8 text-xs bg-white text-gray-900 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Protocols">All Protocols</SelectItem>
                  {PROTOCOLS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Company */}
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Company</label>
              <Select value={company} onValueChange={setCompany}>
                <SelectTrigger className="h-8 text-xs bg-white text-gray-900 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Companies">All Companies</SelectItem>
                  {COMPANIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Breed */}
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Breed</label>
              <Select value={breed} onValueChange={setBreed}>
                <SelectTrigger className="h-8 text-xs bg-white text-gray-900 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Breeds">All Breeds</SelectItem>
                  {breeds.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Search</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  placeholder="Bull or project name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 text-xs pl-7 bg-white text-gray-900 border-border"
                  onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                />
              </div>
            </div>
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-2">
            <Button onClick={handleGenerate} size="sm" className="text-xs h-8 px-4 text-white">
              Generate Report
            </Button>
            <button
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Results */}
        {hasRun && (
          <>
            {/* Table */}
            <div className="rounded-lg border border-border overflow-hidden">
              {isLoading ? (
                <div className="py-16 text-center text-muted-foreground">Loading report…</div>
              ) : reportRows.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  No bulls found for the selected filters.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => toggleSort("bullName")}
                      >
                        Bull Name <SortIcon col="bullName" />
                      </TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Reg. Number</TableHead>
                      <TableHead
                        className="cursor-pointer select-none text-right"
                        onClick={() => toggleSort("totalUnits")}
                      >
                        Units <SortIcon col="totalUnits" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none text-right"
                        onClick={() => toggleSort("projectCount")}
                      >
                        Projects <SortIcon col="projectCount" />
                      </TableHead>
                      <TableHead>Project Names</TableHead>
                      <TableHead>Breeding Date(s)</TableHead>
                      <TableHead>Cattle Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportRows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-foreground">
                          {row.bullName}
                        </TableCell>
                        <TableCell>
                          {row.company ? (
                            <Badge
                              variant="secondary"
                              className={`text-xs ${COMPANY_BADGE[row.company] ?? ""}`}
                            >
                              {row.company}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <ClickableRegNumber registrationNumber={row.registrationNumber || null} breed={row.breed} />
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {row.totalUnits}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {row.projectCount}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[220px]">
                          {row.projectNames}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.breedingDates}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.cattleTypes}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}

        {!hasRun && (
          <div className="py-20 text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Set your filters and click Generate Report</p>
            <p className="text-sm mt-1">Results will show semen usage grouped by bull across matching projects.</p>
          </div>
        )}
      </main>

      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Export Bull Report</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your PDF has been downloaded. You can also share it via email.
          </p>
          <div className="flex flex-col gap-3 pt-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                generateBullReportPdf(pdfRows, stats, {
                  fromDate: appliedFrom,
                  toDate: appliedTo,
                  cattleType: appliedCattle,
                  protocol: appliedProtocol,
                  company: appliedCompany,
                  search: appliedSearch,
                });
              }}
            >
              <Download className="h-4 w-4" />
              Download PDF Again
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              asChild
            >
              <a href={`mailto:?subject=${emailSubject}&body=${emailBody}`}>
                <Mail className="h-4 w-4" />
                Share via Email
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BullReport;
