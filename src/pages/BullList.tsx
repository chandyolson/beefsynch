import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Check, X, ArrowUp, ArrowDown, ArrowLeft } from "lucide-react";
import ClickableRegNumber from "@/components/ClickableRegNumber";

const COMPANIES = ["ABS", "ST Genetics", "Select Sires", "Genex"] as const;

const COMPANY_COLORS: Record<string, string> = {
  ABS: "border-l-blue-400",
  "ST Genetics": "border-l-emerald-400",
  "Select Sires": "border-l-amber-400",
  Genex: "border-l-purple-400",
};

type SortKey = "bull_name" | "registration_number" | "breed" | "company";
type SortDir = "asc" | "desc";

const BullList = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [breedFilter, setBreedFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("bull_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: bulls = [], isLoading } = useQuery({
    queryKey: ["bulls_catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulls_catalog")
        .select("*")
        .order("bull_name");
      if (error) throw error;
      return data;
    },
  });

  const breeds = useMemo(() => {
    const set = new Set(bulls.map((b) => b.breed));
    return [...set].sort();
  }, [bulls]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = bulls.filter((b) => {
      const matchesSearch =
        !q ||
        b.bull_name.toLowerCase().includes(q) ||
        b.registration_number.toLowerCase().includes(q) ||
        b.company.toLowerCase().includes(q) ||
        (b.naab_code && b.naab_code.toLowerCase().includes(q));
      const matchesCompany =
        companyFilter === "all" || b.company === companyFilter;
      const matchesBreed =
        breedFilter === "all" || b.breed === breedFilter;
      return matchesSearch && matchesCompany && matchesBreed;
    });

    list.sort((a, b) => {
      const aVal = (a[sortKey] ?? "").toLowerCase();
      const bVal = (b[sortKey] ?? "").toLowerCase();
      return sortDir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });

    return list;
  }, [bulls, search, companyFilter, breedFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? (
      <ArrowUp className="inline h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="inline h-3 w-3 ml-1" />
    );
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
          <h2 className="text-2xl font-bold font-display text-foreground tracking-tight">
            Bull Catalog
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} of {bulls.length} bulls
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, registration, NAAB code, or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {COMPANIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={breedFilter} onValueChange={setBreedFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Breeds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Breeds</SelectItem>
              {breeds.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Mobile card view */}
        <div className="lg:hidden space-y-3">
          {isLoading ? (
            <p className="text-center py-12 text-muted-foreground">Loading bulls...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">No bulls found.</p>
          ) : (
            filtered.map((bull) => (
              <div
                key={bull.id}
                className={`rounded-lg border border-border bg-card px-3 py-2 border-l-4 ${COMPANY_COLORS[bull.company] ?? "border-l-transparent"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-xs text-foreground truncate min-w-0">
                    {bull.bull_name}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 py-0 ${
                        ({
                          ABS: "bg-blue-500/20 text-blue-300 border-blue-500/30",
                          "ST Genetics": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                          "Select Sires": "bg-amber-500/20 text-amber-300 border-amber-500/30",
                          Genex: "bg-purple-500/20 text-purple-300 border-purple-500/30",
                        } as Record<string, string>)[bull.company] ?? ""
                      }`}
                    >
                      {bull.company}
                    </Badge>
                    {bull.active ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-destructive" />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <ClickableRegNumber registrationNumber={bull.registration_number} breed={bull.breed} />
                  {bull.naab_code && (
                    <span className="text-[11px] text-muted-foreground">· {bull.naab_code}</span>
                  )}
                  <span className="text-[11px] text-muted-foreground">· {bull.breed}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                {(
                  [
                    ["bull_name", "Bull Name"],
                    ["registration_number", "Reg. Number"],
                    ["breed", "Breed"],
                    ["company", "Company"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <TableHead
                    key={key}
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort(key)}
                  >
                    {label}
                    <SortIcon col={key} />
                  </TableHead>
                ))}
                <TableHead className="text-center">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                 <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                     Loading bulls...
                   </TableCell>
                 </TableRow>
               ) : filtered.length === 0 ? (
                 <TableRow>
                   <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    No bulls found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((bull) => (
                  <TableRow
                    key={bull.id}
                    className={`border-l-4 ${COMPANY_COLORS[bull.company] ?? "border-l-transparent"}`}
                  >
                    <TableCell className="font-medium text-foreground">
                      {bull.bull_name}
                      {bull.naab_code && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({bull.naab_code})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ClickableRegNumber registrationNumber={bull.registration_number} breed={bull.breed} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {bull.breed}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${
                          ({
                            ABS: "bg-blue-500/20 text-blue-300 border-blue-500/30",
                            "ST Genetics": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                            "Select Sires": "bg-amber-500/20 text-amber-300 border-amber-500/30",
                            Genex: "bg-purple-500/20 text-purple-300 border-purple-500/30",
                          } as Record<string, string>)[bull.company] ?? ""
                        }`}
                      >
                        {bull.company}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {bull.active ? (
                        <Check className="h-4 w-4 text-primary mx-auto" />
                      ) : (
                        <X className="h-4 w-4 text-destructive mx-auto" />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
};

export default BullList;
