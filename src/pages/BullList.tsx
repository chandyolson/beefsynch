import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, ArrowUp, ArrowDown, ArrowLeft, Download, Star, ExternalLink, Plus, Pencil, Trash2 } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import ClickableRegNumber from "@/components/ClickableRegNumber";
import { toast } from "@/hooks/use-toast";
import { useBullFavorites } from "@/hooks/useBullFavorites";
import { useOrgRole } from "@/hooks/useOrgRole";
import { format } from "date-fns";

const COMPANIES = ["ABS", "ST Genetics", "Select Sires", "Genex"] as const;

const COMPANY_COLORS: Record<string, string> = {
  ABS: "border-l-blue-400",
  "ST Genetics": "border-l-emerald-400",
  "Select Sires": "border-l-amber-400",
  Genex: "border-l-purple-400",
  Custom: "border-l-gray-400",
};

type SortKey = "bull_name" | "registration_number" | "breed" | "company";
type SortDir = "asc" | "desc";

interface CatalogBull {
  id: string;
  bull_name: string;
  registration_number: string;
  breed: string;
  company: string;
  naab_code: string | null;
  active: boolean;
  is_custom?: boolean;
  notes?: string | null;
}

const buildCsv = (bulls: CatalogBull[]): string => {
  const header = "Bull Name,Registration Number,Breed,Company,Active";
  const rows = bulls.map((b) => {
    const name = `"${b.bull_name.replace(/"/g, '""')}"`;
    const reg = b.registration_number || "";
    const breed = `"${b.breed.replace(/"/g, '""')}"`;
    const company = `"${b.company.replace(/"/g, '""')}"`;
    const active = b.active ? "Yes" : "No";
    return `${name},${reg},${breed},${company},${active}`;
  });
  return [header, ...rows].join("\n");
};

const downloadCsv = (csv: string) => {
  const date = format(new Date(), "MMddyyyy");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `BeefSynch_Bulls_${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const BullList = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { orgId, userId } = useOrgRole();
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [breedFilter, setBreedFilter] = useState("all");
  const [starredOnly, setStarredOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("bull_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { favoritedIds, toggleFavorite } = useBullFavorites();

  // Custom bull modal state
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [editingBull, setEditingBull] = useState<CatalogBull | null>(null);
  const [customForm, setCustomForm] = useState({ bull_name: "", naab_code: "", registration_number: "", breed: "", notes: "" });
  const [savingCustom, setSavingCustom] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: bulls = [], isLoading } = useQuery({
    queryKey: ["bulls_catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulls_catalog")
        .select("*")
        .order("bull_name");
      if (error) throw error;
      return data as CatalogBull[];
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
      const matchesStarred = !starredOnly || favoritedIds.has(b.id);

      // Tab-level filtering
      if (activeTab === "custom") return b.is_custom && matchesSearch && matchesBreed && matchesStarred;
      if (activeTab === "select_sires") return !b.is_custom && matchesSearch && matchesCompany && matchesBreed && matchesStarred;

      return matchesSearch && matchesCompany && matchesBreed && matchesStarred;
    });

    list.sort((a, b) => {
      const aVal = (a[sortKey] ?? "").toLowerCase();
      const bVal = (b[sortKey] ?? "").toLowerCase();
      return sortDir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });

    return list;
  }, [bulls, search, companyFilter, breedFilter, starredOnly, favoritedIds, sortKey, sortDir, activeTab]);

  // Clear selection when filters change
  const clearSelection = useCallback(() => {
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
      toast({ title: "Selection cleared — filters updated." });
    }
  }, [selectedIds.size]);

  useEffect(() => {
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, companyFilter, breedFilter, starredOnly]);

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

  // Selection helpers
  const allVisibleSelected = filtered.length > 0 && filtered.every((b) => selectedIds.has(b.id));
  const someSelected = selectedIds.size > 0;

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((b) => b.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleExportSelected = () => {
    const selected = filtered.filter((b) => selectedIds.has(b.id));
    if (selected.length === 0) return;
    downloadCsv(buildCsv(selected));
  };

  const handleExportAllVisible = () => {
    if (filtered.length === 0) return;
    downloadCsv(buildCsv(filtered));
  };

  // Derive favorite bulls from the full catalog
  const favoriteBulls = useMemo(() => {
    return bulls.filter((b) => favoritedIds.has(b.id));
  }, [bulls, favoritedIds]);

  // Select Sires link helper
  const selectSiresUrl = (bull: CatalogBull): string | null => {
    if (!bull.company.toLowerCase().includes("select sires")) return null;
    const breedSlug = bull.breed.toLowerCase().replace(/\s+/g, "-");
    const nameSlug = bull.bull_name.toLowerCase().replace(/\s+/g, "-");
    return `https://selectsiresbeef.com/bull/${breedSlug}/${nameSlug}/`;
  };

  // Custom bull handlers
  const openAddCustom = () => {
    setEditingBull(null);
    setCustomForm({ bull_name: "", naab_code: "", registration_number: "", breed: "", notes: "" });
    setShowCustomModal(true);
  };

  const openEditCustom = (bull: CatalogBull) => {
    setEditingBull(bull);
    setCustomForm({
      bull_name: bull.bull_name,
      naab_code: bull.naab_code || "",
      registration_number: bull.registration_number || "",
      breed: bull.breed || "",
      notes: (bull as any).notes || "",
    });
    setShowCustomModal(true);
  };

  const handleSaveCustom = async () => {
    if (!customForm.bull_name.trim()) {
      toast({ title: "Bull name is required", variant: "destructive" });
      return;
    }
    if (!orgId || !userId) {
      toast({ title: "You must be logged in to an organization", variant: "destructive" });
      return;
    }
    setSavingCustom(true);
    try {
      if (editingBull) {
        const { error } = await supabase
          .from("bulls_catalog")
          .update({
            bull_name: customForm.bull_name.trim(),
            naab_code: customForm.naab_code.trim() || null,
            registration_number: customForm.registration_number.trim() || "N/A",
            breed: customForm.breed.trim() || "Unknown",
            notes: customForm.notes.trim() || null,
          } as any)
          .eq("id", editingBull.id);
        if (error) throw error;
        toast({ title: "Custom bull updated" });
      } else {
        const { error } = await supabase
          .from("bulls_catalog")
          .insert({
            bull_name: customForm.bull_name.trim(),
            naab_code: customForm.naab_code.trim() || null,
            registration_number: customForm.registration_number.trim() || "N/A",
            breed: customForm.breed.trim() || "Unknown",
            company: "Custom",
            is_custom: true,
            created_by: userId,
            organization_id: orgId,
            notes: customForm.notes.trim() || null,
          } as any);
        if (error) throw error;
        toast({ title: "Custom bull created" });
      }
      setShowCustomModal(false);
      queryClient.invalidateQueries({ queryKey: ["bulls_catalog"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingCustom(false);
    }
  };

  const handleDeleteCustom = async (bull: CatalogBull) => {
    // Check if bull is in use
    setDeletingId(bull.id);
    try {
      const [inv, pb, pl, oi] = await Promise.all([
        supabase.from("tank_inventory").select("id", { count: "exact", head: true }).eq("bull_catalog_id", bull.id),
        supabase.from("project_bulls").select("id", { count: "exact", head: true }).eq("bull_catalog_id", bull.id),
        supabase.from("tank_pack_lines").select("id", { count: "exact", head: true }).eq("bull_catalog_id", bull.id),
        supabase.from("semen_order_items").select("id", { count: "exact", head: true }).eq("bull_catalog_id", bull.id),
      ]);
      const total = (inv.count || 0) + (pb.count || 0) + (pl.count || 0) + (oi.count || 0);
      if (total > 0) {
        toast({ title: `Cannot delete — this bull is in use in ${total} place${total !== 1 ? "s" : ""}.`, variant: "destructive" });
        setDeletingId(null);
        return;
      }
      if (!confirm(`Delete "${bull.bull_name}"? This cannot be undone.`)) {
        setDeletingId(null);
        return;
      }
      const { error } = await supabase.from("bulls_catalog").delete().eq("id", bull.id);
      if (error) throw error;
      toast({ title: "Custom bull deleted" });
      queryClient.invalidateQueries({ queryKey: ["bulls_catalog"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  // Shared row renderer for both desktop table and mobile cards
  const renderMobileCard = (bull: CatalogBull, showActions = false) => {
    const ssUrl = selectSiresUrl(bull);
    return (
    <div
      key={bull.id}
      className={`rounded-lg border border-border bg-card px-3 py-2 border-l-4 ${COMPANY_COLORS[bull.company] ?? "border-l-transparent"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={(e) => toggleFavorite(bull.id, e)} className="shrink-0">
            <Star className={`h-4 w-4 transition-colors ${favoritedIds.has(bull.id) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400"}`} />
          </button>
          {activeTab === "all" && (
            <Checkbox
              checked={selectedIds.has(bull.id)}
              onCheckedChange={() => toggleOne(bull.id)}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            />
          )}
          {ssUrl ? (
            <a href={ssUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-xs text-primary hover:underline truncate min-w-0 inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {bull.bull_name}
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            </a>
          ) : (
            <p className="font-medium text-xs text-foreground truncate min-w-0">
              {bull.bull_name}
            </p>
          )}
          {bull.is_custom && (
            <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-muted text-muted-foreground">Custom</Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {showActions && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCustom(bull)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteCustom(bull)} disabled={deletingId === bull.id}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
          <Badge
            variant="secondary"
            className={`text-[10px] px-1.5 py-0 ${
              ({
                ABS: "bg-blue-500/20 text-blue-300 border-blue-500/30",
                "ST Genetics": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                "Select Sires": "bg-amber-500/20 text-amber-300 border-amber-500/30",
                Genex: "bg-purple-500/20 text-purple-300 border-purple-500/30",
                Custom: "bg-gray-500/20 text-gray-300 border-gray-500/30",
              } as Record<string, string>)[bull.company] ?? ""
            }`}
          >
            {bull.company}
          </Badge>
        </div>
      </div>
      <div className={`flex items-center gap-2 mt-0.5 ${activeTab === "all" ? "pl-10" : "pl-6"}`}>
        <ClickableRegNumber registrationNumber={bull.registration_number} breed={bull.breed} />
        {bull.naab_code && (
          <span className="text-[11px] text-muted-foreground">· {bull.naab_code}</span>
        )}
        <span className="text-[11px] text-muted-foreground">· {bull.breed}</span>
      </div>
    </div>
  );
  };

  const renderDesktopRow = (bull: CatalogBull, showCheckbox: boolean, showActions = false) => {
    const ssUrl = selectSiresUrl(bull);
    return (
    <TableRow
      key={bull.id}
      className={`border-l-4 ${COMPANY_COLORS[bull.company] ?? "border-l-transparent"} ${selectedIds.has(bull.id) ? "bg-primary/5" : ""}`}
    >
      <TableCell className="w-8">
        <button onClick={(e) => toggleFavorite(bull.id, e)}>
          <Star className={`h-4 w-4 transition-colors ${favoritedIds.has(bull.id) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400"}`} />
        </button>
      </TableCell>
      {showCheckbox && (
        <TableCell className="w-10">
          <Checkbox
            checked={selectedIds.has(bull.id)}
            onCheckedChange={() => toggleOne(bull.id)}
          />
        </TableCell>
      )}
      <TableCell className="font-medium text-foreground">
        {ssUrl ? (
          <a href={ssUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {bull.bull_name}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          bull.bull_name
        )}
        {bull.naab_code && (
          <span className="ml-2 text-xs text-muted-foreground">
            ({bull.naab_code})
          </span>
        )}
        {bull.is_custom && (
          <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-2 bg-muted text-muted-foreground">Custom</Badge>
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
              Custom: "bg-gray-500/20 text-gray-300 border-gray-500/30",
            } as Record<string, string>)[bull.company] ?? ""
          }`}
        >
          {bull.company}
        </Badge>
      </TableCell>
      {showActions && (
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCustom(bull)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteCustom(bull)} disabled={deletingId === bull.id}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
  };

  const customBullCount = useMemo(() => bulls.filter(b => b.is_custom).length, [bulls]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Dashboard
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold font-display text-foreground tracking-tight">
                Bull Catalog
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {activeTab === "favorites"
                  ? `${favoriteBulls.length} favorite${favoriteBulls.length !== 1 ? "s" : ""}`
                  : `${filtered.length} of ${bulls.length} bulls`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {activeTab === "custom" && (
                <Button size="sm" onClick={openAddCustom}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Custom Bull
                </Button>
              )}
              {activeTab === "all" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportAllVisible}
                  disabled={filtered.length === 0}
                  className="hidden sm:inline-flex"
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Export All Visible
                </Button>
              )}
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList>
            <TabsTrigger value="all">All Bulls</TabsTrigger>
            <TabsTrigger value="select_sires">Select Sires</TabsTrigger>
            <TabsTrigger value="custom">
              Custom Bulls
              {customBullCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{customBullCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="favorites">
              <Star className="h-3.5 w-3.5 mr-1.5" />
              My Favorites
            </TabsTrigger>
          </TabsList>

          {/* ===== ALL BULLS / SELECT SIRES / CUSTOM TABS ===== */}
          {(["all", "select_sires", "custom"] as const).map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4 space-y-6">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, registration, NAAB code, or company..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {tab !== "custom" && (
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
              )}
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
              <Toggle
                pressed={starredOnly}
                onPressedChange={setStarredOnly}
                variant="outline"
                size="sm"
                className="gap-1.5 data-[state=on]:bg-teal-600/20 data-[state=on]:text-teal-400 data-[state=on]:border-teal-500/40"
              >
                <Star className={`h-3.5 w-3.5 ${starredOnly ? "fill-teal-400" : ""}`} />
                Starred Only
              </Toggle>
              {tab === "all" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportAllVisible}
                  disabled={filtered.length === 0}
                  className="sm:hidden"
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Export All Visible
                </Button>
              )}
            </div>

            {/* Bulk action toolbar */}
            {tab === "all" && someSelected && (
              <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
                <span className="text-sm font-medium text-foreground">
                  {selectedIds.size} bull{selectedIds.size !== 1 ? "s" : ""} selected
                </span>
                <Button size="sm" onClick={handleExportSelected}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Export Selected as CSV
                </Button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground underline ml-auto"
                >
                  Clear Selection
                </button>
              </div>
            )}

            {/* Mobile card view */}
            <div className="lg:hidden space-y-3">
              {isLoading ? (
                <p className="text-center py-12 text-muted-foreground">Loading bulls...</p>
              ) : filtered.length === 0 ? (
                <p className="text-center py-12 text-muted-foreground">No bulls found.</p>
              ) : (
                filtered.map((bull) => renderMobileCard(bull, tab === "custom"))
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                    <TableHead className="w-8"></TableHead>
                    {tab === "all" && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allVisibleSelected && filtered.length > 0}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                    )}
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
                    {tab === "custom" && <TableHead className="w-24 text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={tab === "custom" ? 7 : 6} className="text-center py-12 text-muted-foreground">
                        Loading bulls...
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={tab === "custom" ? 7 : 6} className="text-center py-12 text-muted-foreground">
                        No bulls found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((bull) => renderDesktopRow(bull, tab === "all", tab === "custom"))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          ))}

          {/* ===== MY FAVORITES TAB ===== */}
          <TabsContent value="favorites" className="mt-4">
            {/* Mobile card view */}
            <div className="lg:hidden space-y-3">
              {favoriteBulls.length === 0 ? (
                <p className="text-center py-12 text-muted-foreground">
                  No favorites yet — star a bull to add it here.
                </p>
              ) : (
                favoriteBulls.map((bull) => renderMobileCard(bull))
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Bull Name</TableHead>
                    <TableHead>Reg. Number</TableHead>
                    <TableHead>Breed</TableHead>
                    <TableHead>Company</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {favoriteBulls.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        No favorites yet — star a bull to add it here.
                      </TableCell>
                    </TableRow>
                  ) : (
                    favoriteBulls.map((bull) => renderDesktopRow(bull, false))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Custom Bull Modal */}
      <Dialog open={showCustomModal} onOpenChange={setShowCustomModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBull ? "Edit Custom Bull" : "Add Custom Bull"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Bull Name *</Label>
              <Input
                value={customForm.bull_name}
                onChange={(e) => setCustomForm((p) => ({ ...p, bull_name: e.target.value }))}
                placeholder="Bull name"
              />
            </div>
            <div>
              <Label>NAAB Code</Label>
              <Input
                value={customForm.naab_code}
                onChange={(e) => setCustomForm((p) => ({ ...p, naab_code: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Registration Number</Label>
              <Input
                value={customForm.registration_number}
                onChange={(e) => setCustomForm((p) => ({ ...p, registration_number: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Breed</Label>
              <Input
                value={customForm.breed}
                onChange={(e) => setCustomForm((p) => ({ ...p, breed: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={customForm.notes}
                onChange={(e) => setCustomForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomModal(false)}>Cancel</Button>
            <Button onClick={handleSaveCustom} disabled={savingCustom}>
              {savingCustom ? "Saving…" : editingBull ? "Save" : "Add Bull"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BullList;
