import React, { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Plus, Trash2, ChevronRight, ChevronDown, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import BreedingSection from "./BreedingSection";
import {
  ProductLine, SessionLine, SessionInventoryLine, SemenLine, BillingProduct,
  formatCurrency, isBreedingSession,
} from "./billingTypes";

interface SessionsTabProps {
  sessions: SessionLine[];
  productLines: ProductLine[];
  sessionInventory: SessionInventoryLine[];
  semenLines: SemenLine[];
  billingProducts: BillingProduct[];
  readOnly: boolean;
  onSaveSession: (idx: number, updates: Partial<SessionLine>) => void;
  onSaveProduct: (idx: number, updates: Partial<ProductLine>) => void;
  onSwapProduct: (idx: number, newProductId: string) => void;
  onToggleProductInvoiced: (idx: number) => void;
  onAddBreedingSession: () => void;
  onCreateCustomerPickup: () => void;
  onRemoveSession: (idx: number) => void;
  onRemoveProduct: (idx: number) => void;
  onAddProductToSession: (sessionId: string) => void;
  onAddMiscProduct: (sessionId: string) => void;
  onSaveSemen: (idx: number, updates: Partial<SemenLine>) => void;
  onSaveWorksheetCell: (rowId: string, field: "start_units" | "end_units", value: number | null) => void;
  onSetSessionInventory: React.Dispatch<React.SetStateAction<SessionInventoryLine[]>>;
  onTotalUsedChanged: (totalUsed: number, bullUsed: Map<string, number>) => void;
}

export default function SessionsTab({
  sessions, productLines, sessionInventory, semenLines, billingProducts, readOnly,
  onSaveSession, onSaveProduct, onSwapProduct, onToggleProductInvoiced,
  onAddBreedingSession, onCreateCustomerPickup, onRemoveSession,
  onRemoveProduct, onAddProductToSession, onAddMiscProduct, onSaveSemen,
  onSaveWorksheetCell, onSetSessionInventory, onTotalUsedChanged,
}: SessionsTabProps) {
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [editingSessions, setEditingSessions] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) =>
    setExpandedSessions(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleEdit = (id: string) =>
    setEditingSessions(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const productsBySession = useMemo(() => {
    const map = new Map<string | null, ProductLine[]>();
    for (const p of productLines) { const k = p.session_id || null; if (!map.has(k)) map.set(k, []); map.get(k)!.push(p); }
    return map;
  }, [productLines]);

  const pickupSessions = useMemo(() =>
    sessions.filter(s => s.session_type === "customer_pickup")
      .sort((a, b) => a.session_date.localeCompare(b.session_date)), [sessions]);

  const eventSessions = useMemo(() =>
    sessions.filter(s => s.session_type !== "customer_pickup" && s.session_type !== "customer_administered" && !isBreedingSession(s))
      .sort((a, b) => { const d = a.session_date.localeCompare(b.session_date); return d !== 0 ? d : (a.sort_order ?? 0) - (b.sort_order ?? 0); }),
    [sessions]);

  const breedingSessions = useMemo(() =>
    sessions.filter(s => isBreedingSession(s)), [sessions]);

  const fmtUnits = (line: ProductLine) => {
    if (!line.doses) return "—";
    return `${(line.units_billed ?? line.units_calculated ?? 0).toFixed(1)} ${line.unit_label || ""}`.trim();
  };

  function renderProductTable(sessionId: string, isEditing: boolean, products: ProductLine[]) {
    return (
      <>
        {products.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Product</TableHead>
                  <TableHead className="w-[80px] text-right">Head</TableHead>
                  <TableHead className="w-[100px] text-right">Units</TableHead>
                  <TableHead className="w-[90px] text-right">Price</TableHead>
                  <TableHead className="w-[100px] text-right">Total</TableHead>
                  {isEditing && <TableHead className="w-[40px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((line) => {
                  const idx = productLines.findIndex(p => p.id === line.id);
                  const catProds = billingProducts.filter(p => p.product_category === line.product_category);
                  const isMisc = !line.billing_product_id && line.product_category === null;
                  return (
                    <TableRow key={line.id || idx}>
                      <TableCell className="text-sm">
                        {isMisc ? (
                          <Input className="h-8 text-xs" value={line.product_name === "Miscellaneous" ? "" : line.product_name}
                            placeholder="What is this item?"
                            onChange={(e) => onSaveProduct(idx, { product_name: e.target.value || "Miscellaneous" })} />
                        ) : isEditing && catProds.length > 1 ? (
                          <Select value={line.billing_product_id || ""} onValueChange={(v) => onSwapProduct(idx, v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue>{line.product_name}</SelectValue></SelectTrigger>
                            <SelectContent>{catProds.map(p => <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : <span>{line.product_name}</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <Input type="number" className="h-8 w-[70px] text-right text-xs ml-auto" value={line.doses || ""} placeholder="—"
                            onChange={(e) => onSaveProduct(idx, { doses: Number(e.target.value) || 0 })} />
                        ) : <span className="text-sm">{line.doses || "—"}</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs">{fmtUnits(line)}</TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <Input type="number" step="0.01" className="h-8 w-[80px] text-right text-xs ml-auto" value={line.unit_price ?? ""} placeholder="—"
                            onChange={(e) => onSaveProduct(idx, { unit_price: Number(e.target.value) || 0 })} />
                        ) : <span className="text-sm">{line.unit_price ? formatCurrency(line.unit_price) : "—"}</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{line.line_total ? formatCurrency(line.line_total) : "—"}</TableCell>
                      {isEditing && (
                        <TableCell className="text-center p-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => onRemoveProduct(idx)}><Trash2 className="h-3 w-3" /></Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {isEditing && !readOnly && (
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddProductToSession(sessionId)}>
              <Plus className="h-3 w-3 mr-1" /> Add Product
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddMiscProduct(sessionId)}>
              <Plus className="h-3 w-3 mr-1" /> Add Misc
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Top buttons ── */}
      <div className="flex items-center justify-end">
        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onCreateCustomerPickup}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Customer Pickup
            </Button>
          </div>
        )}
      </div>

      {/* ═══ Customer Pickup Cards ═══ */}
      {pickupSessions.map((s) => {
        const sessionIdx = sessions.findIndex(x => x.id === s.id);
        const sessionId = s.id || "";
        const isExpanded = expandedSessions.has(sessionId);
        const prods = productsBySession.get(sessionId) || [];
        const total = prods.reduce((sum, p) => sum + (p.line_total ?? 0), 0);
        return (
          <Card key={sessionId} className="overflow-hidden border-amber-500/30">
            <button type="button" onClick={() => toggleExpand(sessionId)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors">
              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{format(parseISO(s.session_date), "MMM d, yyyy")}</span>
                <span className="text-sm text-muted-foreground">·</span>
                <span className="text-sm">Customer Pickup</span>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-500/40 text-amber-600">Pickup</Badge>
              </div>
              <div className="text-sm font-semibold tabular-nums shrink-0">{total ? formatCurrency(total) : "—"}</div>
            </button>
            {isExpanded && (
              <CardContent className="border-t pt-4 space-y-3">
                {renderProductTable(sessionId, true, prods)}
                {!readOnly && (
                  <div className="flex justify-end pt-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => onRemoveSession(sessionIdx)}><Trash2 className="h-3 w-3 mr-1" /> Remove pickup</Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* ═══ Protocol Event Cards ═══ */}
      {eventSessions.length > 0 && (
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-2">Protocol events</p>
      )}
      {eventSessions.map((s) => {
        const sessionIdx = sessions.findIndex(x => x.id === s.id);
        const sessionId = s.id || "";
        const isExpanded = expandedSessions.has(sessionId);
        const isEditing = editingSessions.has(sessionId);
        const prods = productsBySession.get(sessionId) || [];
        const total = prods.reduce((sum, p) => sum + (p.line_total ?? 0), 0);
        return (
          <Card key={sessionId} className="overflow-hidden">
            <button type="button" onClick={() => toggleExpand(sessionId)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors">
              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{format(parseISO(s.session_date), "MMM d, yyyy")}</span>
                <span className="text-sm text-muted-foreground">·</span>
                <span className="text-sm">{s.session_label || "Session"}</span>
              </div>
              <div className="text-sm font-semibold tabular-nums shrink-0">{total ? formatCurrency(total) : "—"}</div>
            </button>
            {isExpanded && (
              <CardContent className="border-t pt-4 space-y-4">
                {!readOnly && (
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toggleEdit(sessionId)}>
                      {isEditing ? "Done" : <><Pencil className="h-3 w-3 mr-1" /> Edit</>}
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-muted-foreground">Crew</label>
                    {isEditing ? <Input className="h-8 text-xs mt-1" value={s.crew || ""} placeholder="—"
                      onChange={(e) => onSaveSession(sessionIdx, { crew: e.target.value })} />
                      : <p className="mt-1 font-medium">{s.crew || "—"}</p>}
                  </div>
                  <div>
                    <label className="text-muted-foreground">Notes</label>
                    {isEditing ? <Input className="h-8 text-xs mt-1" value={s.notes || ""} placeholder="—"
                      onChange={(e) => onSaveSession(sessionIdx, { notes: e.target.value })} />
                      : <p className="mt-1 font-medium">{s.notes || "—"}</p>}
                  </div>
                </div>
                {prods.length > 0 || isEditing ? renderProductTable(sessionId, isEditing, prods)
                  : <p className="text-xs text-muted-foreground italic">No products on this session.</p>}
                {isEditing && !readOnly && (
                  <div className="flex justify-end pt-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => onRemoveSession(sessionIdx)}><Trash2 className="h-3 w-3 mr-1" /> Remove session</Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* ═══ Breeding Section ═══ */}
      {(breedingSessions.length > 0 || semenLines.length > 0) && (
        <>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-4">Breeding</p>
          <BreedingSection
            sessions={breedingSessions} allSessions={sessions}
            productLines={productLines} sessionInventory={sessionInventory}
            semenLines={semenLines} billingProducts={billingProducts} readOnly={readOnly}
            onSaveSession={onSaveSession} onSaveProduct={onSaveProduct}
            onSaveSemen={onSaveSemen}
            onSwapProduct={onSwapProduct} onRemoveProduct={onRemoveProduct}
            onAddProductToSession={onAddProductToSession}
            onAddBreedingSession={onAddBreedingSession} onRemoveSession={onRemoveSession}
            onSaveWorksheetCell={onSaveWorksheetCell} onSetSessionInventory={onSetSessionInventory}
            onTotalUsedChanged={onTotalUsedChanged}
          />
        </>
      )}

      {/* Unassigned products fallback */}
      {(productsBySession.get(null)?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Unassigned products</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-[100px]">Date</TableHead><TableHead>Product</TableHead>
                  <TableHead className="w-[80px] text-right">Head</TableHead><TableHead className="w-[100px] text-right">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(productsBySession.get(null) || []).map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="text-xs">{line.event_date ? format(parseISO(line.event_date), "MMM d") : "—"}</TableCell>
                      <TableCell className="text-sm">{line.product_name}</TableCell>
                      <TableCell className="text-right text-sm">{line.doses || "—"}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{line.line_total ? formatCurrency(line.line_total) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
