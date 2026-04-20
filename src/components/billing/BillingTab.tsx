import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductLine, SemenLine, formatCurrency } from "./billingTypes";

interface BillingTabProps {
  productLines: ProductLine[];
  semenLines: SemenLine[];
  billingRecord: any;
  readOnly: boolean;
  onSaveProduct: (idx: number, updates: Partial<ProductLine>) => void;
  onSaveSemen: (idx: number, updates: Partial<SemenLine>) => void;
  onToggleProductInvoiced: (idx: number) => void;
  onToggleSemenInvoiced: (idx: number) => void;
  onSaveBillingField: (field: string, value: any) => void;
}

export default function BillingTab({
  productLines, semenLines, billingRecord, readOnly,
  onSaveProduct, onSaveSemen, onToggleProductInvoiced, onToggleSemenInvoiced,
  onSaveBillingField,
}: BillingTabProps) {
  const [editing, setEditing] = useState(false);

  const productsTotal = productLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
  const productsInvoiced = productLines.filter(l => l.invoiced).reduce((s, l) => s + (l.line_total ?? 0), 0);
  const semenTotal = semenLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
  const semenInvoiced = semenLines.filter(l => l.invoiced).reduce((s, l) => s + (l.line_total ?? 0), 0);
  const grandTotal = productsTotal + semenTotal;
  const grandInvoiced = productsInvoiced + semenInvoiced;

  return (
    <>
      {/* ── Billing Summary Card ── */}
      <Card className="border-2 border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between w-full">
            <CardTitle className="text-lg">Billing summary</CardTitle>
            {!readOnly && (
              <Button variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => setEditing(!editing)}>
                {editing ? "Done" : "Edit"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* ── Products & Services ── */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Products &amp; services
            </p>
            {productLines.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No products yet.</p>
            ) : (
              <div className="space-y-0">
                {productLines.map((line, idx) => {
                  const isInvoiced = !!line.invoiced;
                  return (
                    <div key={line.id || idx}
                      className={`flex items-center justify-between py-2 border-b border-border/50 text-sm ${
                        isInvoiced ? "text-muted-foreground" : ""}`}>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`truncate ${isInvoiced ? "" : "text-foreground"}`}>
                          {line.product_name}
                          {line.protocol_event_label ? ` — ${line.protocol_event_label}` : ""}
                        </span>
                        {isInvoiced && !editing && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 whitespace-nowrap font-medium">
                            Previously invoiced
                          </span>
                        )}
                        {editing && (
                          <button type="button"
                            className={`text-[10px] px-2 py-0.5 rounded whitespace-nowrap font-medium ${
                              isInvoiced
                                ? "bg-amber-500/15 text-amber-600"
                                : "bg-muted text-muted-foreground border border-dashed border-border"}`}
                            onClick={() => onToggleProductInvoiced(idx)}>
                            {isInvoiced ? "Invoiced" : "Mark invoiced"}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {editing ? (
                          <>
                            <Input type="number" className="h-7 w-[60px] text-right text-xs"
                              value={line.doses ?? ""}
                              onChange={(e) => onSaveProduct(idx, { doses: Number(e.target.value) || 0 })} />
                            <Input type="number" step="0.01" className="h-7 w-[70px] text-right text-xs"
                              value={line.unit_price ?? ""}
                              onChange={(e) => onSaveProduct(idx, { unit_price: Number(e.target.value) || 0 })} />
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {line.doses || "—"} × {formatCurrency(line.unit_price)}
                          </span>
                        )}
                        <span className={`font-medium w-[80px] text-right ${isInvoiced ? "text-muted-foreground" : ""}`}>
                          {formatCurrency(line.line_total)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <span className="text-sm font-medium">{formatCurrency(productsTotal)}</span>
            </div>
          </div>

          {/* ── Semen ── */}
          {semenLines.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Semen</p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bull</TableHead>
                      <TableHead className="w-[60px] text-right">Packed</TableHead>
                      <TableHead className="w-[60px] text-right">Used</TableHead>
                      <TableHead className="w-[60px] text-right">Blown</TableHead>
                      <TableHead className="w-[70px] text-right">Billable</TableHead>
                      <TableHead className="w-[70px] text-right">Price</TableHead>
                      <TableHead className="w-[80px] text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {semenLines.map((line, idx) => {
                      const used = (line.units_packed ?? 0) - (line.units_returned ?? 0);
                      return (
                        <TableRow key={line.id || idx}>
                          <TableCell>
                            <span className="text-sm font-medium">{line.bull_name}</span>
                            {line.bull_code && (
                              <span className="text-xs text-muted-foreground ml-1.5">{line.bull_code}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {line.units_packed || "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm">{used || "—"}</TableCell>
                          <TableCell className="text-right">
                            {editing ? (
                              <Input type="number" className="h-7 w-[50px] text-right text-xs ml-auto"
                                value={line.units_blown ?? ""} placeholder="—"
                                onChange={(e) => onSaveSemen(idx, { units_blown: Number(e.target.value) || 0 })} />
                            ) : (
                              <span className="text-sm">{line.units_blown ?? "—"}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {line.units_billable || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {editing ? (
                              <Input type="number" step="0.01" className="h-7 w-[60px] text-right text-xs ml-auto"
                                value={line.unit_price ?? ""}
                                onChange={(e) => onSaveSemen(idx, { unit_price: Number(e.target.value) || 0 })} />
                            ) : (
                              <span className="text-sm">{formatCurrency(line.unit_price)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {formatCurrency(line.line_total)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end pt-2">
                <span className="text-sm font-medium">{formatCurrency(semenTotal)}</span>
              </div>
            </div>
          )}

          {/* ── Grand Total ── */}
          <div className="border-t-2 border-border pt-3">
            <div className="flex justify-between items-baseline">
              <span className="text-lg font-medium">Grand total</span>
              <span className="text-xl font-bold">{formatCurrency(grandTotal)}</span>
            </div>
            {grandInvoiced > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground mt-1">
                <span>Previously invoiced</span>
                <span className="font-medium">{formatCurrency(grandInvoiced)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Invoice Numbers ── */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">Invoice numbers</p>
            {!readOnly && (
              <Button variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => setEditing(!editing)}>
                {editing ? "Done" : "Edit"}
              </Button>
            )}
          </div>
          {editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">CATL invoice #</label>
                <Input className="mt-1 h-8 text-sm"
                  defaultValue={billingRecord?.catl_invoice_number || ""}
                  onBlur={(e) => onSaveBillingField("catl_invoice_number", e.target.value || null)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Select Sires invoice #</label>
                <Input className="mt-1 h-8 text-sm"
                  defaultValue={billingRecord?.select_sires_invoice_number || ""}
                  onBlur={(e) => onSaveBillingField("select_sires_invoice_number", e.target.value || null)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Project ID</label>
                <Input className="mt-1 h-8 text-sm"
                  defaultValue={billingRecord?.zoho_project_id || ""}
                  onBlur={(e) => onSaveBillingField("zoho_project_id", e.target.value || null)} />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {billingRecord?.catl_invoice_number && (
                <span><span className="text-muted-foreground">CATL:</span>{" "}
                  <span className="font-medium">{billingRecord.catl_invoice_number}</span></span>
              )}
              {billingRecord?.select_sires_invoice_number && (
                <span><span className="text-muted-foreground">Select Sires:</span>{" "}
                  <span className="font-medium">{billingRecord.select_sires_invoice_number}</span></span>
              )}
              {billingRecord?.zoho_project_id && (
                <span><span className="text-muted-foreground">Project ID:</span>{" "}
                  <span className="font-medium">{billingRecord.zoho_project_id}</span></span>
              )}
              {!billingRecord?.catl_invoice_number && !billingRecord?.select_sires_invoice_number &&
                !billingRecord?.zoho_project_id && (
                  <span className="text-muted-foreground">No invoice numbers set</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Notes ── */}
      <Card>
        <CardContent className="py-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">Notes</p>
          {editing ? (
            <Textarea className="min-h-[80px] text-sm"
              defaultValue={billingRecord?.notes || ""} placeholder="Billing notes..."
              onBlur={(e) => onSaveBillingField("notes", e.target.value || null)} />
          ) : (
            <p className="text-sm">
              {billingRecord?.notes || <span className="text-muted-foreground">No notes</span>}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
