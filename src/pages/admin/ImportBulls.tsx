import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Database, Upload, Loader2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ParsedBull {
  naab_code: string;
  name: string;
  registration_number: string;
  breed: string;
  dob: string;
}

interface ImportResult {
  created_count?: number;
  skipped_count?: number;
  real_company_count?: number;
  unknown_company_count?: number;
  parse_failure_count?: number;
  parse_failures?: any[];
  error_count?: number;
  errors?: any[];
  unknown_controllers?: string[];
}

interface MatchResult {
  total_examined?: number;
  matched?: number;
  unmatched?: number;
  no_bull_code?: number;
  parse_failures?: number;
}

const HEADER_MAP: Record<string, string> = {
  code: "naab_code", naab: "naab_code", "naab code": "naab_code", naab_code: "naab_code",
  name: "name", "bull name": "name", bull_name: "name",
  registration: "registration_number", "registration #": "registration_number",
  reg: "registration_number", "reg #": "registration_number", registration_number: "registration_number",
  breed: "breed",
  "date of birth": "dob", dob: "dob", "birth date": "dob",
};

const ImportBulls = () => {
  const navigate = useNavigate();

  // Access control
  const { data: membership, isLoading: memberLoading } = useQuery({
    queryKey: ["my-membership-admin"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("accepted", true)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (membership && !["owner", "admin"].includes(membership.role)) {
      toast({ title: "Admin access required", variant: "destructive" });
      navigate("/dashboard");
    }
  }, [membership, navigate]);

  // State
  const [file, setFile] = useState<File | null>(null);
  const [defaultBreed, setDefaultBreed] = useState("");
  const [listName, setListName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedBulls, setParsedBulls] = useState<ParsedBull[]>([]);
  const [parseProblems, setParseProblems] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [matchDryRun, setMatchDryRun] = useState(false);
  const [failuresOpen, setFailuresOpen] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    setImportResult(null);
    setMatchResult(null);
    setParseProblems([]);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

      const rawGrid: any[][] = XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        defval: "",
        blankrows: false,
      });

      if (rawGrid.length === 0) {
        toast({ title: "No rows found in file", variant: "destructive" });
        setParsing(false);
        return;
      }

      const RECOGNIZED_HEADERS = ["code", "naab", "naab code", "name", "bull name", "registration", "registration #", "reg", "reg #", "breed", "dob", "date of birth", "birth date"];
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(5, rawGrid.length); i++) {
        const row = rawGrid[i];
        if (row.some((cell: any) => typeof cell === "string" && RECOGNIZED_HEADERS.includes(cell.trim().toLowerCase()))) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        toast({
          title: "Could not find header row",
          description: "The first 5 rows did not contain recognizable column headers (CODE, NAME, REGISTRATION, etc.)",
          variant: "destructive",
        });
        setParsing(false);
        return;
      }

      const headers: string[] = rawGrid[headerRowIndex].map((h: any) => String(h || "").trim());
      const dataRows = rawGrid.slice(headerRowIndex + 1);

      const findCol = (aliases: string[]): number => {
        for (let i = 0; i < headers.length; i++) {
          const h = headers[i].toLowerCase();
          if (aliases.some((a) => h === a.toLowerCase())) return i;
        }
        return -1;
      };

      const codeCol = findCol(["code", "naab", "naab code", "naab_code"]);
      const nameCol = findCol(["name", "bull name", "bull_name"]);
      const regCol = findCol(["registration", "registration #", "reg", "reg #", "registration_number"]);
      const breedCol = findCol(["breed"]);
      const dobCol = findCol(["date of birth", "dob", "birth date"]);

      const problems: string[] = [];
      const bulls: ParsedBull[] = [];

      const filteredRows = dataRows.filter((row: any[]) => row.some((cell: any) => cell !== "" && cell != null));

      for (let i = 0; i < filteredRows.length; i++) {
        const row = filteredRows[i];
        const bull: ParsedBull = {
          naab_code: codeCol >= 0 ? String(row[codeCol] ?? "").trim() : "",
          name: nameCol >= 0 ? String(row[nameCol] ?? "").trim() : "",
          registration_number: regCol >= 0 ? String(row[regCol] ?? "").trim() : "",
          breed: (breedCol >= 0 ? String(row[breedCol] ?? "").trim() : "") || defaultBreed || "",
          dob: dobCol >= 0 ? String(row[dobCol] ?? "").trim() : "",
        };

        if (!bull.naab_code && !bull.name) {
          problems.push(`Row ${headerRowIndex + 2 + i}: missing both NAAB code and name — skipped`);
          continue;
        }

        bulls.push(bull);
      }

      setParsedBulls(bulls);
      setParseProblems(problems);
      toast({ title: `Parsed ${bulls.length} bulls from ${file.name}` });
    } catch (err: any) {
      toast({ title: "Failed to parse file", description: err?.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (parsedBulls.length === 0) return;
    setImporting(true);
    setImportResult(null);
    setMatchResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("import-bull-catalog", {
        body: {
          list_name: listName || undefined,
          default_breed: defaultBreed || undefined,
          bulls: parsedBulls,
        },
      });
      if (error) throw error;
      setImportResult(data);
      toast({ title: `Imported ${data?.created_count ?? 0} bulls` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const handleMatch = async (dryRun: boolean) => {
    setMatching(true);
    setMatchDryRun(dryRun);
    setMatchResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("match-inventory-to-catalog", {
        body: { dry_run: dryRun },
      });
      if (error) throw error;
      setMatchResult(data);
      toast({ title: dryRun ? "Dry run complete" : "Matching complete" });
    } catch (err: any) {
      toast({ title: "Matching failed", description: err?.message, variant: "destructive" });
    } finally {
      setMatching(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParsedBulls([]);
    setParseProblems([]);
    setImportResult(null);
    setMatchResult(null);
    setListName("");
    setDefaultBreed("");
  };

  const validNaabCount = parsedBulls.filter((b) => b.naab_code).length;

  if (memberLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8 space-y-8 max-w-4xl">
        <div className="flex items-center gap-3">
          <Database className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Import Bull Catalog</h1>
        </div>

        {/* Section 1 — Upload & Parse */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload & Parse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Excel file (.xlsx)</Label>
                <Input
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="space-y-2">
                <Label>List Name (optional)</Label>
                <Input
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  placeholder="e.g. Archived Select Sires Beef - Angus"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Default Breed (optional fallback)</Label>
                <Input
                  value={defaultBreed}
                  onChange={(e) => setDefaultBreed(e.target.value)}
                  placeholder="e.g. Angus"
                />
              </div>
            </div>
            <Button onClick={handleParse} disabled={!file || parsing}>
              {parsing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Parsing…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" /> Parse File
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Section 2 — Preview */}
        {parsedBulls.length > 0 && !importResult && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <Badge variant="secondary" className="text-sm px-3 py-1">
                  {parsedBulls.length} rows parsed
                </Badge>
                <Badge variant="secondary" className="text-sm px-3 py-1 bg-green-600/20 text-green-400 border-green-600/30">
                  {validNaabCount} with NAAB codes
                </Badge>
                {parseProblems.length > 0 && (
                  <Badge variant="secondary" className="text-sm px-3 py-1 bg-yellow-600/20 text-yellow-400 border-yellow-600/30">
                    {parseProblems.length} problems
                  </Badge>
                )}
              </div>

              {parseProblems.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-yellow-400 hover:underline">
                    <AlertTriangle className="h-4 w-4" /> Show parse problems
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 bg-muted/50 rounded p-3 text-xs space-y-1 max-h-40 overflow-auto">
                    {parseProblems.map((p, i) => (
                      <div key={i}>{p}</div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="overflow-auto rounded border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NAAB Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Registration</TableHead>
                      <TableHead>Breed</TableHead>
                      <TableHead>DOB</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedBulls.slice(0, 50).map((b, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{b.naab_code}</TableCell>
                        <TableCell>{b.name}</TableCell>
                        <TableCell className="font-mono text-xs">{b.registration_number}</TableCell>
                        <TableCell>{b.breed}</TableCell>
                        <TableCell className="text-xs">{b.dob}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedBulls.length > 50 && (
                  <div className="text-xs text-muted-foreground p-2 text-center">
                    Showing first 50 of {parsedBulls.length} rows
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button size="lg" onClick={handleImport} disabled={importing}>
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Importing…
                    </>
                  ) : (
                    "Run Import"
                  )}
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  Cancel / Reset
                </Button>
              </div>
              {importing && (
                <p className="text-sm text-muted-foreground">
                  This may take up to 2 minutes for large files. Please don't navigate away.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Section 3 — Results */}
        {importResult && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-400" /> Import Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard label="Created" value={importResult.created_count ?? 0} color="text-green-400" />
                <SummaryCard label="Skipped (Existed)" value={importResult.skipped_count ?? 0} color="text-muted-foreground" />
                <SummaryCard label="Real Company" value={importResult.real_company_count ?? 0} color="text-blue-400" />
                <SummaryCard label="Unknown Company" value={importResult.unknown_company_count ?? 0} color="text-yellow-400" />
              </div>

              {(importResult.parse_failure_count ?? 0) > 0 && (
                <Collapsible open={failuresOpen} onOpenChange={setFailuresOpen}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-yellow-400 hover:underline">
                    {failuresOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Parse Failures ({importResult.parse_failure_count})
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 bg-muted/50 rounded p-3 text-xs space-y-1 max-h-60 overflow-auto">
                    {importResult.parse_failures?.map((f, i) => (
                      <div key={i} className="font-mono">{JSON.stringify(f)}</div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {(importResult.error_count ?? 0) > 0 && (
                <Collapsible open={errorsOpen} onOpenChange={setErrorsOpen}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-destructive hover:underline">
                    {errorsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Errors ({importResult.error_count})
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 bg-muted/50 rounded p-3 text-xs space-y-1 max-h-60 overflow-auto">
                    {importResult.errors?.map((e, i) => (
                      <div key={i} className="font-mono">{JSON.stringify(e)}</div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {(importResult.unknown_controllers?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Unknown Controllers Seen</p>
                  <div className="flex flex-wrap gap-2">
                    {importResult.unknown_controllers?.map((c, i) => (
                      <Badge key={i} variant="outline" className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Inventory matching */}
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Inventory Matching</p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleMatch(true)}
                    disabled={matching}
                  >
                    {matching && matchDryRun ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Preview Matching (Dry Run)
                  </Button>
                  <Button
                    onClick={() => handleMatch(false)}
                    disabled={matching}
                  >
                    {matching && !matchDryRun ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Run Inventory Matching Pass
                  </Button>
                </div>

                {matchResult && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
                    <SummaryCard label="Examined" value={matchResult.total_examined ?? 0} color="text-foreground" />
                    <SummaryCard label="Matched" value={matchResult.matched ?? 0} color="text-green-400" />
                    <SummaryCard label="Unmatched" value={matchResult.unmatched ?? 0} color="text-yellow-400" />
                    <SummaryCard label="No Bull Code" value={matchResult.no_bull_code ?? 0} color="text-muted-foreground" />
                    <SummaryCard label="Parse Failures" value={matchResult.parse_failures ?? 0} color="text-destructive" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      <AppFooter />
    </div>
  );
};

const SummaryCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="rounded-lg border border-border bg-card p-4 text-center">
    <div className={`text-2xl font-bold ${color}`}>{value}</div>
    <div className="text-xs text-muted-foreground mt-1">{label}</div>
  </div>
);

export default ImportBulls;
