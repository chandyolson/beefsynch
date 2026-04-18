import { useState, useMemo, Fragment } from "react";
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
  Star,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { format, startOfYear, endOfYear } from "date-fns";
import { generateBullReportPdf, BullReportRow } from "@/lib/generateBullReportPdf";
import ClickableRegNumber from "@/components/ClickableRegNumber";
import { useBullFavorites } from "@/hooks/useBullFavorites";

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
type DataSource = "all" | "projects" | "orders";

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

interface OrderItemJoin {
  units: number;
  custom_bull_name: string | null;
  bull_catalog_id: string | null;
  bulls_catalog: {
    bull_name: string;
    company: string;
    registration_number: string;
    breed: string;
  } | null;
  semen_order_id: string;
  semen_orders: {
    id: string;
    customers: { name: string } | null;
    order_date: string;
  } | null;
}

const BullReport = () => {
  const { favoritedIds, toggleFavorite } = useBullFavorites();
  const navigate = useNavigate();

  // Filters
  const [fromDate, setFromDate] = useState(DEFAULT_FROM);
  const [toDate, setToDate] = useState(DEFAULT_TO);
  const [cattleType, setCattleType] = useState("All");
  const [protocol, setProtocol] = useState("All Protocols");
  const [company, setCompany] = useState("All Companies");
  const [breed, setBreed] = useState("All Breeds");
  const [search, setSearch] = useState("");
  const [dataSource, setDataSource] = useState<DataSource>("all");
  const [hasRun, setHasRun] = useState(false);

  // Applied (committed) filters
  const [appliedFrom, setAppliedFrom] = useState(DEFAULT_FROM);
  const [appliedTo, setAppliedTo] = useState(DEFAULT_TO);
  const [appliedCattle, setAppliedCattle] = useState("All");
  const [appliedProtocol, setAppliedProtocol] = useState("All Protocols");
  const [appliedCompany, setAppliedCompany] = useState("All Companies");
  const [appliedBreed, setAppliedBreed] = useState("All Breeds");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedSource, setAppliedSource] = useState<DataSource>("all");

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("totalUnits");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Expanded bull rows
  const [expandedBulls, setExpandedBulls] = useState<Set<number>>(new Set());
  const toggleExpand = (idx: number) => {
    setExpandedBulls((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

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
        .not("breed", "is", null)
        .order("breed");
      if (error) throw error;
      const set = new Set((data ?? []).map((d) => d.breed).filter(Boolean));
      return [...set].sort() as string[];
    },
  });

  // Fetch project bulls
  const { data: rawRows = [], isLoading: loadingProjects } = useQuery({
    queryKey: ["bull_report_projects", appliedFrom, appliedTo, appliedCattle, appliedProtocol],
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

      if (appliedFrom) query = query.gte("projects.breeding_date", appliedFrom);
      if (appliedTo) query = query.lte("projects.breeding_date", appliedTo);
      if (appliedCattle !== "All") query = query.eq("projects.cattle_type", appliedCattle);
      if (appliedProtocol !== "All Protocols") query = query.eq("projects.protocol", appliedProtocol);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ProjectBullJoin[];
    },
    enabled: hasRun && appliedSource !== "orders",
  });

  // Fetch order items
  const { data: orderRows = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["bull_report_orders", appliedFrom, appliedTo],
    queryFn: async () => {
      let query = supabase
        .from("semen_order_items")
        .select(`
          units,
          custom_bull_name,
          bull_catalog_id,
          semen_order_id,
          bulls_catalog (bull_name, company, registration_number, breed),
          semen_orders!inner (id, order_date, order_type, customers(name))
        `)
        .eq("semen_orders.order_type", "customer");

      if (appliedFrom) query = query.gte("semen_orders.order_date", appliedFrom);
      if (appliedTo) query = query.lte("semen_orders.order_date", appliedTo);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as OrderItemJoin[];
    },
    enabled: hasRun && appliedSource !== "projects",
  });

  const isLoading = loadingProjects || loadingOrders;

  // Group by bull — merge both sources
  const reportRows = useMemo(() => {
    type DetailEntry = { name: string; units: number; date: string; cattleType: string; headCount: number; type: "project" | "order"; id: string };
    const map = new Map<string, BullReportRow & { 
      projectIds: Set<string>; 
      orderIds: Set<string>;
      headSet: Map<string, number>;
      namesList: string[];
      datesList: string[];
      typesSet: Set<string>;
      fromProjects: boolean;
      fromOrders: boolean;
      detailsList: DetailEntry[];
    }>();

    const getBullKey = (catalogId: string | null, catalog: { bull_name: string } | null, customName: string | null) => {
      return catalogId && catalog
        ? `catalog_${catalogId}`
        : `custom_${customName ?? "unknown"}`;
    };

    const initEntry = (key: string, bullName: string, co: string, regNum: string, breed: string) => {
      if (!map.has(key)) {
        map.set(key, {
          bullName, company: co, registrationNumber: regNum, breed,
          totalUnits: 0, projectCount: 0, projectNames: "", breedingDates: "", cattleTypes: "",
          source: "Project",
          projectIds: new Set(), orderIds: new Set(), headSet: new Map(),
          namesList: [], datesList: [], typesSet: new Set(),
          fromProjects: false, fromOrders: false,
          detailsList: [],
        });
      }
      return map.get(key)!;
    };

    // Process project bulls
    if (appliedSource !== "orders") {
      for (const row of rawRows) {
        const proj = row.projects;
        if (!proj) continue;
        const isCatalog = !!row.bull_catalog_id && !!row.bulls_catalog;
        const key = getBullKey(row.bull_catalog_id, row.bulls_catalog, row.custom_bull_name);
        const bullName = isCatalog ? row.bulls_catalog!.bull_name : row.custom_bull_name ?? "Unknown";
        const co = isCatalog ? row.bulls_catalog!.company : "";
        const regNum = isCatalog ? row.bulls_catalog!.registration_number : "";
        const br = isCatalog ? row.bulls_catalog!.breed : "";

        if (appliedCompany !== "All Companies" && co !== appliedCompany) continue;
        if (appliedBreed !== "All Breeds" && br !== appliedBreed) continue;
        const q = appliedSearch.toLowerCase();
        if (q && !bullName.toLowerCase().includes(q) && !proj.name.toLowerCase().includes(q)) continue;

        const entry = initEntry(key, bullName, co, regNum, br);
        entry.totalUnits += row.units;
        entry.fromProjects = true;

        if (!entry.projectIds.has(proj.id)) {
          entry.projectIds.add(proj.id);
          entry.headSet.set(proj.id, proj.head_count);
          entry.namesList.push(proj.name);
          if (proj.breeding_date) {
            entry.datesList.push(format(new Date(proj.breeding_date + "T00:00:00"), "M/d/yyyy"));
          }
          entry.typesSet.add(proj.cattle_type);
          entry.detailsList.push({
            name: proj.name,
            units: row.units,
            date: proj.breeding_date ? format(new Date(proj.breeding_date + "T00:00:00"), "M/d/yyyy") : "—",
            cattleType: proj.cattle_type,
            headCount: proj.head_count,
            type: "project",
            id: proj.id,
          });
        } else {
          const existing = entry.detailsList.find((d) => d.id === proj.id && d.type === "project");
          if (existing) existing.units += row.units;
        }
      }
    }

    // Process order items
    if (appliedSource !== "projects") {
      for (const row of orderRows) {
        const ord = row.semen_orders;
        if (!ord) continue;
        const isCatalog = !!row.bull_catalog_id && !!row.bulls_catalog;
        const key = getBullKey(row.bull_catalog_id, row.bulls_catalog, row.custom_bull_name);
        const bullName = isCatalog ? row.bulls_catalog!.bull_name : row.custom_bull_name ?? "Unknown";
        const co = isCatalog ? row.bulls_catalog!.company : "";
        const regNum = isCatalog ? row.bulls_catalog!.registration_number : "";
        const br = isCatalog ? row.bulls_catalog!.breed : "";

        if (appliedCompany !== "All Companies" && co !== appliedCompany) continue;
        if (appliedBreed !== "All Breeds" && br !== appliedBreed) continue;
        const q = appliedSearch.toLowerCase();
        if (q && !bullName.toLowerCase().includes(q) && !(ord.customers?.name || "").toLowerCase().includes(q)) continue;

        const entry = initEntry(key, bullName, co, regNum, br);
        entry.totalUnits += row.units;
        entry.fromOrders = true;

        if (!entry.orderIds.has(ord.id)) {
          entry.orderIds.add(ord.id);
          entry.namesList.push(`Order: ${ord.customers?.name || "Unknown"}`);
          entry.datesList.push(format(new Date(ord.order_date + "T00:00:00"), "M/d/yyyy"));
          entry.detailsList.push({
            name: ord.customers?.name || "Unknown",
            units: row.units,
            date: format(new Date(ord.order_date + "T00:00:00"), "M/d/yyyy"),
            cattleType: "Order",
            headCount: 0,
            type: "order",
            id: ord.id,
          });
        } else {
          const existing = entry.detailsList.find((d) => d.id === ord.id && d.type === "order");
          if (existing) existing.units += row.units;
        }
      }
    }

    // Finalize
    const result: BullReportRow[] = [];
    for (const [, entry] of map.entries()) {
      entry.projectCount = entry.projectIds.size + entry.orderIds.size;
      if (entry.namesList.length === 0) continue;

      entry.source = entry.fromProjects && entry.fromOrders ? "Both"
        : entry.fromProjects ? "Project" : "Order";

      result.push({
        bullName: entry.bullName,
        company: entry.company,
        registrationNumber: entry.registrationNumber,
        breed: entry.breed,
        totalUnits: entry.totalUnits,
        projectCount: entry.projectCount,
        projectNames: entry.namesList.join(", "),
        breedingDates: entry.datesList.join(", "),
        cattleTypes: [...entry.typesSet].join(", "),
        source: entry.source,
        details: entry.detailsList.slice().sort((a, b) => a.date.localeCompare(b.date)),
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
  }, [rawRows, orderRows, appliedSearch, appliedCompany, appliedBreed, appliedSource, sortKey, sortDir]);

  // Stats
  const stats = useMemo(() => {
    const projectIds = new Set<string>();
    let totalHead = 0;
    const projectHeads = new Map<string, number>();

    if (appliedSource !== "orders") {
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
        if (!projectHeads.has(row.projects.id)) {
          projectHeads.set(row.projects.id, row.projects.head_count);
        }
        projectIds.add(row.projects.id);
      }
    }

    if (appliedSource !== "projects") {
      for (const row of orderRows) {
        if (!row.semen_orders) continue;
        const bull = row.bulls_catalog;
        const bullName = bull ? bull.bull_name : row.custom_bull_name ?? "";
        const co = bull ? bull.company : "";
        const br = bull ? bull.breed : "";
        const q = appliedSearch.toLowerCase();
        if (appliedCompany !== "All Companies" && co !== appliedCompany) continue;
        if (appliedBreed !== "All Breeds" && br !== appliedBreed) continue;
        if (q && !bullName.toLowerCase().includes(q) && !(row.semen_orders.customers?.name || "").toLowerCase().includes(q)) continue;
        projectIds.add(`order_${row.semen_orders.id}`);
      }
    }

    for (const [, head] of projectHeads) {
      totalHead += head;
    }

    return {
      totalBulls: reportRows.length,
      totalUnits: reportRows.reduce((s, r) => s + r.totalUnits, 0),
      totalProjects: projectIds.size,
      totalHead,
    };
  }, [reportRows, rawRows, orderRows, appliedSearch, appliedCompany, appliedBreed, appliedSource]);

  const handleGenerate = () => {
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
    setAppliedCattle(cattleType);
    setAppliedProtocol(protocol);
    setAppliedCompany(company);
    setAppliedBreed(breed);
    setAppliedSearch(search);
    setAppliedSource(dataSource);
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
    setDataSource("all");
    setAppliedFrom(DEFAULT_FROM);
    setAppliedTo(DEFAULT_TO);
    setAppliedCattle("All");
    setAppliedProtocol("All Protocols");
    setAppliedCompany("All Companies");
    setAppliedBreed("All Breeds");
    setAppliedSearch("");
    setAppliedSource("all");
    setHasRun(false);
  };

  const handleExportCsv = () => {
    const headers = ["Bull Name", "Registration Number", "Company", "Breed", "Units Committed", "Source", "Project/Order Count", "Names", "Dates", "Cattle Type"];
    const escape = (v: string | number) => {
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.map(escape).join(","),
      ...reportRows.map((r) =>
        [r.bullName, r.registrationNumber, r.company, r.breed, r.totalUnits, r.source, r.projectCount, r.projectNames, r.breedingDates, r.cattleTypes]
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

  const getFilters = () => ({
    fromDate: appliedFrom,
    toDate: appliedTo,
    cattleType: appliedCattle,
    protocol: appliedProtocol,
    company: appliedCompany,
    search: appliedSearch,
    dataSource: appliedSource,
  });

  const handleExport = () => {
    setPdfRows(reportRows);
    generateBullReportPdf(reportRows, stats, getFilters());
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
    `Please find attached the BeefSynch Bull Report for ${fromLabel} to ${toLabel}.`
  );

  // Find catalog id for favorites
  const findCatalogId = (bullName: string): string | null => {
    const matchProject = rawRows.find((r) => {
      const name = r.bulls_catalog ? r.bulls_catalog.bull_name : r.custom_bull_name ?? "";
      return name === bullName && r.bull_catalog_id;
    });
    if (matchProject?.bull_catalog_id) return matchProject.bull_catalog_id;
    const matchOrder = orderRows.find((r) => {
      const name = r.bulls_catalog ? r.bulls_catalog.bull_name : r.custom_bull_name ?? "";
      return name === bullName && r.bull_catalog_id;
    });
    return matchOrder?.bull_catalog_id ?? null;
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate("/operations")}
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
                Semen usage across projects and orders by date range
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
            <StatCard title={appliedSource === "orders" ? "Total Orders" : appliedSource === "projects" ? "Total Projects" : "Total Projects/Orders"} value={stats.totalProjects} delay={200} />
            <StatCard title="Total Head in Range" value={stats.totalHead} delay={300} />
          </div>
        )}

        {/* Filters */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          {/* Data Source toggle */}
          <div className="space-y-0.5">
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Data Source</label>
            <div className="flex rounded-md border border-border overflow-hidden h-8 max-w-xs">
              {(["all", "projects", "orders"] as DataSource[]).map((src) => (
                <button
                  key={src}
                  onClick={() => setDataSource(src)}
                  className={`flex-1 text-xs font-medium transition-colors px-3 ${
                    dataSource === src
                      ? "bg-primary text-primary-foreground"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {src === "all" ? "All" : src === "projects" ? "Projects" : "Orders"}
                </button>
              ))}
            </div>
          </div>

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

            {/* Cattle Type - only relevant for projects */}
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
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="w-8"></TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => toggleSort("bullName")}
                      >
                        Bull Name <SortIcon col="bullName" />
                      </TableHead>
                      <TableHead>Company</TableHead>
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
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportRows.map((row, i) => {
                      const catalogId = findCatalogId(row.bullName);
                      const isFav = catalogId ? favoritedIds.has(catalogId) : false;
                      const isExpanded = expandedBulls.has(i);
                      return (
                        <Fragment key={`bull-${i}`}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/20"
                            onClick={() => toggleExpand(i)}
                          >
                            <TableCell className="w-8">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (catalogId) toggleFavorite(catalogId, e);
                                }}
                              >
                                <Star className={`h-4 w-4 transition-colors ${isFav ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400"}`} />
                              </button>
                            </TableCell>
                            <TableCell className="w-8 text-muted-foreground">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                              {row.bullName}
                              {row.registrationNumber && (
                                <span className="ml-2 text-xs text-muted-foreground">({row.registrationNumber})</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {row.company ? (
                                <Badge variant="secondary" className={`text-xs ${COMPANY_BADGE[row.company] ?? ""}`}>
                                  {row.company}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-lg">{row.totalUnits}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{row.projectCount}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  row.source === "Both"
                                    ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                                    : row.source === "Order"
                                    ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                                    : "bg-green-500/20 text-green-300 border-green-500/30"
                                }`}
                              >
                                {row.source}
                              </Badge>
                            </TableCell>
                          </TableRow>
                          {isExpanded &&
                            row.details &&
                            row.details.map((d, di) => (
                              <TableRow
                                key={`detail-${i}-${di}`}
                                className="bg-muted/10 hover:bg-muted/20 cursor-pointer"
                                onClick={() =>
                                  navigate(d.type === "project" ? `/project/${d.id}` : `/orders/${d.id}`)
                                }
                              >
                                <TableCell></TableCell>
                                <TableCell></TableCell>
                                <TableCell className="text-sm pl-8" colSpan={2}>
                                  {d.type === "order" ? `Order: ${d.name}` : d.name}
                                  <span className="ml-2 text-xs text-muted-foreground">{d.date}</span>
                                </TableCell>
                                <TableCell className="text-right font-medium">{d.units}</TableCell>
                                <TableCell className="text-right text-xs text-muted-foreground">
                                  {d.type === "project" ? `${d.headCount} hd` : ""}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{d.cattleType}</TableCell>
                              </TableRow>
                            ))}
                        </Fragment>
                      );
                    })}
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
            <p className="text-sm mt-1">Results will show semen usage grouped by bull across matching projects and orders.</p>
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
                generateBullReportPdf(pdfRows, stats, getFilters());
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
