import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
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
  const productsTotal = productLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
  const semenTotal = semenLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
  const grandTotal = productsTotal + semenTotal;

  return (
    <>
      {/* ── Products & Services ── */}
      <Card className="border-2 border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Products &amp; Services</CardTitle>
        </CardHeader>
        <CardContent>
          {productLines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No products yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {!readOnly && <TableHead className="w-[40px]"></TableHead>}
                    <TableHead>Product</TableHead>
                    <TableHead className="w-[80px] text-right">Qty</TableHead>
                    <TableHead className="w-[80px] text-right">Price</TableHead>
                    <TableHead className="w-[90px] text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productLines
                    .filter(line => line.doses > 0 || (line.line_total ?? 0) > 0 || (line.units_billed ?? 0) > 0)
                    .map((line) => {
                      const idx = productLines.findIndex(p => p.id === line.id);
                      const isInvoiced = !!line.invoiced;
                      return (
                        <TableRow key={line.id || idx} className={isInvoiced ? "text-muted-foreground" : ""}>
                          {!readOnly && (
                            <TableCell>
                              <Checkbox
                                checked={isInvoiced}
                                onCheckedChange={() => onToggleProductInvoiced(idx)}
                              />
                            </TableCell>
                          )}
                          <TableCell className={isInvoiced ? "line-through" : ""}>
                            <span className="text-sm font-medium">
                              {line.product_name}
                              {line.protocol_event_label ? ` — ${line.protocol_event_label}` : ""}
                            </span>
                            {line.unit_label && (
                              <span className="block text-xs text-muted-foreground">({line.unit_label})</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {readOnly ? (
                              <span className="text-sm">{line.units_billed ?? line.doses ?? "—"}</span>
                            ) : (
                              <Input type="number" step="0.01" className="h-7 w-[70px] text-right text-xs ml-auto"
                                value={line.units_billed ?? ""} placeholder="—"
                                onChange={(e) => onSaveProduct(idx, { units_billed: Number(e.target.value) || 0 })} />
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {readOnly ? (
                              <span className="text-sm">{line.unit_price ? formatCurrency(line.unit_price) : "—"}</span>
                            ) : (
                              <Input type="number" step="0.01" className="h-7 w-[70px] text-right text-xs ml-auto"
                                value={line.unit_price ?? ""} placeholder="—"
                                onChange={(e) => onSaveProduct(idx, { unit_price: Number(e.target.value) || 0 })} />
                            )}
                          </TableCell>
                          <TableCell className={`text-right text-sm font-medium ${isInvoiced ? "text-muted-foreground" : ""}`}>
                            {formatCurrency(line.line_total)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex justify-end pt-2">
            <span className="text-sm font-medium">{formatCurrency(productsTotal)}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Semen ── */}
      {semenLines.length > 0 && (
        <Card className="border-2 border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Semen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {!readOnly && <TableHead className="w-[40px]"></TableHead>}
                    <TableHead>Bull</TableHead>
                    <TableHead className="w-[60px] text-right">Packed</TableHead>
                    <TableHead className="w-[60px] text-right">Used</TableHead>
                    <TableHead className="w-[70px] text-right">Blown</TableHead>
                    <TableHead className="w-[80px] text-right">Billable</TableHead>
                    <TableHead className="w-[70px] text-right">Price</TableHead>
                    <TableHead className="w-[80px] text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {semenLines.map((line, idx) => {
                    const isInvoiced = !!line.invoiced;
                    const used = (line.units_packed ?? 0) - (line.units_returned ?? 0);
                    return (
                      <TableRow key={line.id || idx} className={isInvoiced ? "text-muted-foreground" : ""}>
                        {!readOnly && (
                          <TableCell>
                            <Checkbox
                              checked={isInvoiced}
                              onCheckedChange={() => onToggleSemenInvoiced(idx)}
                            />
                          </TableCell>
                        )}
                        <TableCell className={isInvoiced ? "line-through" : ""}>
                          <span className="text-sm font-medium">{line.bull_name}</span>
                          {line.bull_code && (
                            <span className="text-xs text-muted-foreground ml-1.5">{line.bull_code}</span>
                          )}
                          {line.semen_owner && (
                            <span className="block text-xs text-amber-500 font-medium">{line.semen_owner}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {line.units_packed || "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm">{used || "—"}</TableCell>
                        <TableCell className="text-right text-sm">
                          {readOnly ? (
                            <span>{line.units_blown ?? "—"}</span>
                          ) : (
                            <Input type="number" className="h-7 w-[60px] text-right text-xs ml-auto"
                              value={line.units_blown ?? ""} placeholder="—"
                              onChange={(e) => onSaveSemen(idx, { units_blown: Number(e.target.value) || 0 })} />
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {readOnly ? (
                            <span>{line.units_billable || "—"}</span>
                          ) : (
                            <Input type="number" className="h-7 w-[70px] text-right text-xs ml-auto"
                              value={line.units_billable ?? ""} placeholder="—"
                              onChange={(e) => onSaveSemen(idx, { units_billable: Number(e.target.value) || 0 })} />
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {readOnly ? (
                            <span className="text-sm">{line.unit_price ? formatCurrency(line.unit_price) : "—"}</span>
                          ) : (
                            <Input type="number" step="0.01" className="h-7 w-[60px] text-right text-xs ml-auto"
                              value={line.unit_price ?? ""} placeholder="—"
                              onChange={(e) => onSaveSemen(idx, { unit_price: Number(e.target.value) || 0 })} />
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
          </CardContent>
        </Card>
      )}

      {/* ── Grand Total ── */}
      <Card>
        <CardContent className="py-4">
          <div className="flex justify-between items-baseline">
            <span className="text-lg font-medium">Grand total</span>
            <span className="text-xl font-bold">{formatCurrency(grandTotal)}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Invoice Numbers ── */}
      <Card>
        <CardContent className="py-4">
          <p className="text-sm font-medium mb-3">Invoice numbers</p>
          {readOnly ? (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {billingRecord?.catl_invoice_number && (
                <span><span className="text-muted-foreground">CATL:</span>{" "}
                  <span className="font-medium">{billingRecord.catl_invoice_number}</span></span>
              )}
              {billingRecord?.select_sires_invoice_number && (
                <span><span className="text-muted-foreground">Select Sires:</span>{" "}
                  <span className="font-medium">{billingRecord.select_sires_invoice_number}</span></span>
              )}
              {!billingRecord?.catl_invoice_number && !billingRecord?.select_sires_invoice_number && (
                <span className="text-muted-foreground">No invoice numbers set</span>
              )}
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>

      {/* ── Notes ── */}
      <Card>
        <CardContent className="py-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">Notes</p>
          {readOnly ? (
            <p className="text-sm">
              {billingRecord?.notes || <span className="text-muted-foreground">No notes</span>}
            </p>
          ) : (
            <Textarea className="min-h-[80px] text-sm"
              defaultValue={billingRecord?.notes || ""} placeholder="Billing notes..."
              onBlur={(e) => onSaveBillingField("notes", e.target.value || null)} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
