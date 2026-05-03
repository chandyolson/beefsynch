import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus } from "lucide-react";
import { ProductLine, SemenLine, LaborLine, formatCurrency } from "./billingTypes";

const DELIVERY_OPTIONS = [
  { value: "not_yet", label: "Not yet", className: "border border-dashed border-border text-muted-foreground bg-transparent" },
  { value: "pickup", label: "Pickup", className: "bg-blue-500/15 text-blue-600 border border-blue-500/30" },
  { value: "we_gave", label: "We gave", className: "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30" },
  { value: "drop_off", label: "Drop off", className: "bg-amber-500/15 text-amber-600 border border-amber-500/30" },
] as const;

function nextDelivery(current: string | null | undefined): string {
  const order = ["not_yet", "pickup", "we_gave", "drop_off"];
  const idx = order.indexOf(current || "not_yet");
  return order[(idx + 1) % order.length];
}

function deliveryPill(value: string | null | undefined) {
  return DELIVERY_OPTIONS.find(o => o.value === (value || "not_yet")) || DELIVERY_OPTIONS[0];
}

interface BillingTabProps {
  productLines: ProductLine[];
  semenLines: SemenLine[];
  laborLines: LaborLine[];
  billingRecord: any;
  readOnly: boolean;
  onSaveProduct: (idx: number, updates: Partial<ProductLine>) => void;
  onSaveSemen: (idx: number, updates: Partial<SemenLine>) => void;
  onToggleProductInvoiced: (idx: number) => void;
  onToggleSemenInvoiced: (idx: number) => void;
  onSaveBillingField: (field: string, value: any) => void;
  onSaveLabor: (idx: number, updates: Partial<LaborLine>) => void;
  onAddLabor: () => void;
  onDeleteLabor: (idx: number) => void;
  onAddProduct: () => void;
  onDeleteProduct: (idx: number) => void;
}

export default function BillingTab({
  productLines, semenLines, laborLines, billingRecord, readOnly,
  onSaveProduct, onSaveSemen, onToggleProductInvoiced, onToggleSemenInvoiced,
  onSaveBillingField, onSaveLabor, onAddLabor, onDeleteLabor,
  onAddProduct, onDeleteProduct,
}: BillingTabProps) {
  const protocolLines = productLines
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => !!line.protocol_event_label);
  const additionalLines = productLines
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => !line.protocol_event_label);

  const productsTotal = productLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
  const semenTotal = semenLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
  const laborTotal = laborLines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const grandTotal = productsTotal + semenTotal + laborTotal;

  const renderProductRow = (
    { line, idx }: { line: ProductLine; idx: number },
    showStep: boolean,
    showDelete: boolean,
  ) => {
    const isInvoiced = !!line.invoiced;
    const pill = deliveryPill(line.delivery_method);
    return (
      <TableRow key={line.id || idx} className={isInvoiced ? "text-muted-foreground" : ""}>
        {!readOnly && (
          <TableCell>
            <Checkbox checked={isInvoiced} onCheckedChange={() => onToggleProductInvoiced(idx)} />
          </TableCell>
        )}
        <TableCell className={isInvoiced ? "line-through" : ""}>
          {showDelete && !readOnly ? (
            <Input
              className="h-7 text-xs"
              value={line.product_name ?? ""}
              onChange={(e) => onSaveProduct(idx, { product_name: e.target.value })}
            />
          ) : (
            <span className="text-sm font-medium">{line.product_name}</span>
          )}
          {line.unit_label && !showDelete && (
            <span className="block text-xs text-muted-foreground">({line.unit_label})</span>
          )}
        </TableCell>
        {showStep && (
          <TableCell className="text-xs text-muted-foreground">
            {line.protocol_event_label || ""}
          </TableCell>
        )}
        <TableCell className="text-right">
          {readOnly ? (
            <span className="text-sm">{line.units_billed ?? "—"}</span>
          ) : (
            <Input
              type="number" step="0.01"
              className="h-7 w-[70px] text-right text-xs ml-auto"
              value={line.units_billed ?? ""} placeholder="—"
              onChange={(e) => onSaveProduct(idx, { units_billed: Number(e.target.value) || 0 })}
            />
          )}
        </TableCell>
        <TableCell className="text-right">
          {readOnly ? (
            <span className="text-sm">{line.unit_price ? formatCurrency(line.unit_price) : "—"}</span>
          ) : (
            <Input
              type="number" step="0.01"
              className="h-7 w-[70px] text-right text-xs ml-auto"
              value={line.unit_price ?? ""} placeholder="—"
              onChange={(e) => onSaveProduct(idx, { unit_price: Number(e.target.value) || 0 })}
            />
          )}
        </TableCell>
        <TableCell className={`text-right text-sm font-medium ${isInvoiced ? "text-muted-foreground" : ""}`}>
          {(line.line_total ?? 0) > 0 ? formatCurrency(line.line_total) : "—"}
        </TableCell>
        <TableCell>
          {readOnly ? (
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${pill.className}`}>
              {pill.label}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onSaveProduct(idx, { delivery_method: nextDelivery(line.delivery_method) } as any)}
              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${pill.className}`}
            >
              {pill.label}
            </button>
          )}
        </TableCell>
        {showDelete && !readOnly && (
          <TableCell>
            <button
              type="button"
              onClick={() => onDeleteProduct(idx)}
              className="text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Delete product"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </TableCell>
        )}
      </TableRow>
    );
  };

  return (
    <>
      {/* ── Protocol Products ── */}
      <Card className="border-2 border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Protocol products</CardTitle>
          <p className="text-xs text-muted-foreground">Products from the protocol. Enter quantities picked up or used.</p>
        </CardHeader>
        <CardContent>
          {protocolLines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No protocol products.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {!readOnly && <TableHead className="w-[40px]"></TableHead>}
                    <TableHead>Product</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead className="w-[80px] text-right">Qty</TableHead>
                    <TableHead className="w-[80px] text-right">Price</TableHead>
                    <TableHead className="w-[90px] text-right">Total</TableHead>
                    <TableHead className="w-[110px]">Delivered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {protocolLines.map(item => renderProductRow(item, true, false))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex justify-end pt-2">
            <span className="text-sm font-medium">
              {formatCurrency(protocolLines.reduce((s, { line }) => s + (line.line_total ?? 0), 0))}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Additional Products ── */}
      <Card className="border-2 border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Additional products</CardTitle>
              <p className="text-xs text-muted-foreground">Non-protocol items: fly tags, pink eye treatment, etc.</p>
            </div>
            {!readOnly && (
              <Button variant="outline" size="sm" className="h-8" onClick={onAddProduct}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add product
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {additionalLines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No additional products.</p>
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
                    <TableHead className="w-[110px]">Delivered</TableHead>
                    {!readOnly && <TableHead className="w-[40px]"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {additionalLines.map(item => renderProductRow(item, false, true))}
                </TableBody>
              </Table>
            </div>
          )}
          {additionalLines.length > 0 && (
            <div className="flex justify-end pt-2">
              <span className="text-sm font-medium">
                {formatCurrency(additionalLines.reduce((s, { line }) => s + (line.line_total ?? 0), 0))}
              </span>
            </div>
          )}
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
                            <Checkbox checked={isInvoiced} onCheckedChange={() => onToggleSemenInvoiced(idx)} />
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

      {/* ── Labor ── */}
      <Card className="border-2 border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Labor</CardTitle>
              <p className="text-xs text-muted-foreground">What work did we do on this project?</p>
            </div>
            {!readOnly && (
              <Button variant="outline" size="sm" className="h-8" onClick={onAddLabor}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add entry
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {laborLines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No labor entries.</p>
          ) : (
            <div className="space-y-2">
              {laborLines.map((line, idx) => (
                <div key={line.id || idx} className={`flex items-start gap-3 ${line.invoiced ? "text-muted-foreground" : ""}`}>
                  {!readOnly && (
                    <Checkbox
                      className="mt-2"
                      checked={!!line.invoiced}
                      onCheckedChange={() => onSaveLabor(idx, {
                        invoiced: !line.invoiced,
                        invoiced_at: !line.invoiced ? new Date().toISOString() : null,
                      })}
                    />
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_120px] gap-2 flex-1">
                    {readOnly ? (
                      <span className={`text-sm ${line.invoiced ? "line-through" : ""}`}>{line.description || "—"}</span>
                    ) : (
                      <Input className="h-8 text-sm" placeholder="Description"
                        value={line.description ?? ""}
                        onChange={(e) => onSaveLabor(idx, { description: e.target.value })} />
                    )}
                    {readOnly ? (
                      <span className="text-sm text-muted-foreground">{line.labor_dates || "—"}</span>
                    ) : (
                      <Input className="h-8 text-sm" placeholder="Dates"
                        value={line.labor_dates ?? ""}
                        onChange={(e) => onSaveLabor(idx, { labor_dates: e.target.value })} />
                    )}
                    {readOnly ? (
                      <span className="text-sm text-right font-medium">{line.amount ? formatCurrency(line.amount) : "—"}</span>
                    ) : (
                      <Input type="number" step="0.01" className="h-8 text-sm text-right"
                        placeholder="0.00" value={line.amount ?? ""}
                        onChange={(e) => onSaveLabor(idx, { amount: Number(e.target.value) || 0 })} />
                    )}
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => onDeleteLabor(idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors mt-2"
                      aria-label="Delete labor entry"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {laborLines.length > 0 && (
            <div className="flex justify-end pt-3">
              <span className="text-sm font-medium">{formatCurrency(laborTotal)}</span>
            </div>
          )}
        </CardContent>
      </Card>

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
