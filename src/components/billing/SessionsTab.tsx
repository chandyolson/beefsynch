import React, { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Plus, Trash2, ChevronRight, ChevronDown, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ProductLine, SessionLine, SessionInventoryLine, BillingProduct,
  formatCurrency, isBreedingSession,
} from "./billingTypes";

interface SessionsTabProps {
  sessions: SessionLine[];
  productLines: ProductLine[];
  sessionInventory: SessionInventoryLine[];
  billingProducts: BillingProduct[];
  readOnly: boolean;
  onSaveSession: (idx: number, updates: Partial<SessionLine>) => void;
  onSaveProduct: (idx: number, updates: Partial<ProductLine>) => void;
  onSwapProduct: (idx: number, newProductId: string) => void;
  onToggleProductInvoiced: (idx: number) => void;
  onAddSession: (sessionType: string) => void;
  onRemoveSession: (idx: number) => void;
  onRemoveProduct: (idx: number) => void;
  onAddProductToSession: (sessionId: string) => void;
  onSaveWorksheetCell: (rowId: string, field: "start_units" | "end_units", value: number | null) => void;
  onSetSessionInventory: React.Dispatch<React.SetStateAction<SessionInventoryLine[]>>;
}

export default function SessionsTab({
  sessions, productLines, sessionInventory, billingProducts, readOnly,
  onSaveSession, onSaveProduct, onSwapProduct, onToggleProductInvoiced,
  onAddSession, onRemoveSession, onRemoveProduct, onAddProductToSession,
  onSaveWorksheetCell, onSetSessionInventory,
}: SessionsTabProps) {
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [editingSessions, setEditingSessions] = useState<Set<string>>(new Set());

  const toggleSession = (id: string) =>
    setExpandedSessions(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleEditing = (id: string) =>
    setEditingSessions(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const productsBySession = useMemo(() => {
    const map = new Map<string | null, ProductLine[]>();
    for (const p of productLines) {
      const key = p.session_id || null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [productLines]);

  const sortedSessions = useMemo(() =>
    [...sessions].sort((a, b) => {
      const d = a.session_date.localeCompare(b.session_date);
      return d !== 0 ? d : (a.sort_order ?? 0) - (b.sort_order ?? 0);
    }), [sessions]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sortedSessions.length} session{sortedSessions.length === 1 ? "" : "s"}
        </p>
        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs"
              onClick={() => onAddSession("customer_pickup")}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Customer Pickup
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs"
              onClick={() => onAddSession("field_session")}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Session
            </Button>
          </div>
        )}
      </div>

      {sortedSessions.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No sessions yet. Add a session to start tracking field activity and billing.
          </CardContent>
        </Card>
      )}

      {sortedSessions.map((s) => {
        const sessionIdx = sessions.findIndex(x => x.id === s.id);
        const sessionId = s.id || "";
        const isExpanded = expandedSessions.has(sessionId);
        const isEditing = editingSessions.has(sessionId);
        const sessionProducts = productsBySession.get(sessionId) || [];
        const sessionTotal = sessionProducts.reduce((sum, p) => sum + (p.line_total ?? 0), 0);
        const isPickup = s.session_type === "customer_pickup";
        const isCustomerAdmin = s.session_type === "customer_administered";
        const isBreed = isBreedingSession(s);
        const showDetailFields = !isPickup && !isCustomerAdmin;
        const breedInventoryRows = isBreed
          ? sessionInventory.filter(si => si.session_id === sessionId) : [];

        return (
          <Card key={sessionId} className={`overflow-hidden ${isCustomerAdmin ? "opacity-70" : ""}`}>
            <button type="button" onClick={() => toggleSession(sessionId)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors">
              {isExpanded
                ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{format(parseISO(s.session_date), "MMM d, yyyy")}</span>
                  <span className="text-sm text-muted-foreground">·</span>
                  <span className="text-sm">{s.session_label || "Session"}</span>
                  {isPickup && <Badge variant="outline" className="text-[10px] py-0 px-1.5">Customer pickup</Badge>}
                  {isCustomerAdmin && <Badge variant="outline" className="text-[10px] py-0 px-1.5">Customer administered</Badge>}
                  {isBreed && <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/40 text-primary">Breeding</Badge>}
                </div>
              </div>
              <div className="text-sm font-semibold tabular-nums shrink-0">
                {isCustomerAdmin ? "—" : formatCurrency(sessionTotal)}
              </div>
            </button>

            {isExpanded && (
              <CardContent className="border-t pt-4 space-y-4">
                {!readOnly && !isCustomerAdmin && (
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => toggleEditing(sessionId)}>
                      {isEditing ? "Done" : <><Pencil className="h-3 w-3 mr-1" /> Edit</>}
                    </Button>
                  </div>
                )}

                {showDetailFields && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="text-muted-foreground">Head count</label>
                      {isEditing ? (
                        <Input type="number" className="h-8 text-xs mt-1 w-[80px]" value={s.head_count ?? ""} placeholder="—"
                          onChange={(e) => onSaveSession(sessionIdx, { head_count: e.target.value ? Number(e.target.value) : null })} />
                      ) : <p className="mt-1 font-medium">{s.head_count ?? "—"}</p>}
                    </div>
                    <div>
                      <label className="text-muted-foreground">Crew</label>
                      {isEditing ? (
                        <Input className="h-8 text-xs mt-1" value={s.crew || ""} placeholder="—"
                          onChange={(e) => onSaveSession(sessionIdx, { crew: e.target.value })} />
                      ) : <p className="mt-1 font-medium">{s.crew || "—"}</p>}
                    </div>
                    <div>
                      <label className="text-muted-foreground">Notes</label>
                      {isEditing ? (
                        <Input className="h-8 text-xs mt-1" value={s.notes || ""} placeholder="—"
                          onChange={(e) => onSaveSession(sessionIdx, { notes: e.target.value })} />
                      ) : <p className="mt-1 font-medium">{s.notes || "—"}</p>}
                    </div>
                  </div>
                )}

                {isCustomerAdmin ? (
                  <p className="text-sm text-muted-foreground italic">
                    Products accounted for in customer pickup. No billable activity.
                  </p>
                ) : (
                  <>
                    {sessionProducts.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[180px]">Product</TableHead>
                              <TableHead className="w-[80px] text-right">Qty</TableHead>
                              <TableHead className="w-[100px] text-right">Units</TableHead>
                              <TableHead className="w-[90px] text-right">Price</TableHead>
                              <TableHead className="w-[100px] text-right">Total</TableHead>
                              {isEditing && <TableHead className="w-[40px]" />}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sessionProducts.map((line) => {
                              const idx = productLines.findIndex(p => p.id === line.id);
                              const categoryProducts = billingProducts.filter(p => p.product_category === line.product_category);
                              return (
                                <TableRow key={line.id || idx}>
                                  <TableCell className="text-sm">
                                    {isEditing && categoryProducts.length > 1 ? (
                                      <Select value={line.billing_product_id || ""} onValueChange={(v) => onSwapProduct(idx, v)}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue>{line.product_name}</SelectValue></SelectTrigger>
                                        <SelectContent>
                                          {categoryProducts.map(p => <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    ) : <span>{line.product_name}</span>}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {isEditing ? (
                                      <Input type="number" className="h-8 w-[70px] text-right text-xs ml-auto"
                                        value={line.doses || ""} placeholder="—"
                                        onChange={(e) => onSaveProduct(idx, { doses: Number(e.target.value) || 0 })} />
                                    ) : <span className="text-sm">{line.doses || "—"}</span>}
                                  </TableCell>
                                  <TableCell className="text-right text-xs">
                                    {(line.units_billed ?? line.units_calculated ?? 0).toFixed(1)} {line.unit_label || ""}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {isEditing ? (
                                      <Input type="number" step="0.01" className="h-8 w-[80px] text-right text-xs ml-auto"
                                        value={line.unit_price ?? ""}
                                        onChange={(e) => onSaveProduct(idx, { unit_price: Number(e.target.value) || 0 })} />
                                    ) : <span className="text-sm">{formatCurrency(line.unit_price)}</span>}
                                  </TableCell>
                                  <TableCell className="text-right text-sm font-medium">{formatCurrency(line.line_total)}</TableCell>
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
                    ) : (
                      !isEditing && !isPickup && <p className="text-xs text-muted-foreground italic">No products on this session.</p>
                    )}

                    {(isEditing || isPickup) && !readOnly && (
                      <Button variant="outline" size="sm" className="h-7 text-xs"
                        onClick={() => onAddProductToSession(sessionId)}>
                        <Plus className="h-3 w-3 mr-1" /> Add Product
                      </Button>
                    )}

                    {isBreed && breedInventoryRows.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Semen inventory</div>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Bull</TableHead>
                                <TableHead className="w-[60px] text-center">Can.</TableHead>
                                <TableHead className="w-[80px] text-right">Start</TableHead>
                                <TableHead className="w-[80px] text-right">End</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {breedInventoryRows.map((row) => (
                                <TableRow key={row.id}>
                                  <TableCell className="text-xs">
                                    {row.bull_name}
                                    {row.bull_code && <span className="ml-1 text-muted-foreground">· {row.bull_code}</span>}
                                  </TableCell>
                                  <TableCell className="text-center text-xs font-mono">{row.canister}</TableCell>
                                  <TableCell className="p-1">
                                    {isEditing ? (
                                      <Input type="number" className="h-8 w-full text-right text-xs"
                                        value={row.start_units ?? ""} placeholder="—"
                                        onBlur={(e) => { if (!row.id) return; const v = e.target.value === "" ? null : Number(e.target.value); if (v !== row.start_units) onSaveWorksheetCell(row.id, "start_units", v); }}
                                        onChange={(e) => { if (!row.id) return; const v = e.target.value === "" ? null : Number(e.target.value); onSetSessionInventory(prev => prev.map(r => r.id === row.id ? { ...r, start_units: v } : r)); }} />
                                    ) : <span className="text-xs text-right block">{row.start_units ?? "—"}</span>}
                                  </TableCell>
                                  <TableCell className="p-1">
                                    {isEditing ? (
                                      <Input type="number" className="h-8 w-full text-right text-xs"
                                        value={row.end_units ?? ""} placeholder="—"
                                        onBlur={(e) => { if (!row.id) return; const v = e.target.value === "" ? null : Number(e.target.value); if (v !== row.end_units) onSaveWorksheetCell(row.id, "end_units", v); }}
                                        onChange={(e) => { if (!row.id) return; const v = e.target.value === "" ? null : Number(e.target.value); onSetSessionInventory(prev => prev.map(r => r.id === row.id ? { ...r, end_units: v } : r)); }} />
                                    ) : <span className="text-xs text-right block">{row.end_units ?? "—"}</span>}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {isEditing && !readOnly && (
                  <div className="flex justify-end pt-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => onRemoveSession(sessionIdx)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Remove session
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {(productsBySession.get(null)?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Unassigned products</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-[80px] text-right">Qty</TableHead>
                    <TableHead className="w-[100px] text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(productsBySession.get(null) || []).map((line) => {
                    const idx = productLines.findIndex(p => p.id === line.id);
                    return (
                      <TableRow key={line.id || idx}>
                        <TableCell className="text-xs">{line.event_date ? format(parseISO(line.event_date), "MMM d") : "—"}</TableCell>
                        <TableCell className="text-sm">{line.product_name}</TableCell>
                        <TableCell className="text-right text-sm">{line.doses || "—"}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(line.line_total)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
