import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BillingProduct } from "./billingTypes";

const CATEGORY_LABELS: Record<string, string> = {
  gnrh: "GnRH",
  pgf: "PGF",
  cidr: "CIDR",
  patch: "Patches",
  supply: "Supplies",
  service: "Services",
  breeding_supply: "Breeding Supplies",
  sheath: "Sheaths",
  glove: "Gloves",
  gun_warmer: "Gun Warmers",
  ai_gun: "AI Guns",
  heat_detection: "Heat Detection",
  nutritional: "Nutritional",
  rental: "Rentals",
  other: "Other",
};

// Inputs hide the native number spinner arrows to match the project standard.
const NUMBER_INPUT_CLASS =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

interface SaveProductToCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProductName: string;
  initialPrice: number | null;
  existingCategories: string[];
  organizationId: string;
  onSaved: (newCatalogProduct: BillingProduct) => void;
}

export default function SaveProductToCatalogDialog({
  open, onOpenChange, initialProductName, initialPrice, existingCategories, organizationId, onSaved,
}: SaveProductToCatalogDialogProps) {
  const [productName, setProductName] = useState(initialProductName);
  const [category, setCategory] = useState("");
  const [addingNewCategory, setAddingNewCategory] = useState(false);
  const [drugName, setDrugName] = useState("");
  const [dosesPerUnit, setDosesPerUnit] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [defaultPrice, setDefaultPrice] = useState(initialPrice == null ? "" : String(initialPrice));
  const [qboItemName, setQboItemName] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset the form whenever the dialog (re)opens for a new misc row.
  useEffect(() => {
    if (!open) return;
    setProductName(initialProductName);
    setCategory("");
    setAddingNewCategory(false);
    setDrugName("");
    setDosesPerUnit("");
    setUnitLabel("");
    setDefaultPrice(initialPrice == null ? "" : String(initialPrice));
    setQboItemName("");
    setSaving(false);
  }, [open, initialProductName, initialPrice]);

  const sortedCategories = useMemo(
    () =>
      [...existingCategories].sort((a, b) =>
        (CATEGORY_LABELS[a] ?? a).localeCompare(CATEGORY_LABELS[b] ?? b),
      ),
    [existingCategories],
  );

  const canSave = productName.trim() !== "" && category.trim() !== "" && !saving;

  async function handleSave() {
    setSaving(true);
    try {
      // 1. Compute sort_order: max for this category + 1, fallback 1
      const normalizedCategory = category.trim().toLowerCase().replace(/\s+/g, "_");
      const { data: maxRow } = await supabase
        .from("billing_products")
        .select("sort_order")
        .eq("organization_id", organizationId)
        .eq("product_category", normalizedCategory)
        .order("sort_order", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      const nextSort = (maxRow?.sort_order ?? 0) + 1;
      // 2. Insert catalog row
      const insertRow = {
        organization_id: organizationId,
        product_name: productName.trim(),
        product_category: normalizedCategory,
        drug_name: drugName.trim() || null,
        doses_per_unit: dosesPerUnit === "" ? null : Number(dosesPerUnit),
        unit_label: unitLabel.trim() || null,
        default_price: defaultPrice === "" ? null : Number(defaultPrice),
        qbo_item_name: qboItemName.trim() || null,
        is_default: false,
        active: true,
        sort_order: nextSort,
      };
      const { data: inserted, error } = await supabase
        .from("billing_products")
        .insert(insertRow)
        .select()
        .single();
      if (error) throw error;
      if (!inserted) throw new Error("No row returned from insert");
      onSaved(inserted as BillingProduct);
      toast({
        title: "Saved to catalog",
        description: `${inserted.product_name} is now available in the product dropdown.`,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Couldn't save to catalog",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Save product to catalog</DialogTitle>
          <DialogDescription>
            Add this product to your catalog so it's pickable from the product dropdown on every future
            project, order, and session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Product Name */}
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] sm:items-center gap-1 sm:gap-3">
            <Label htmlFor="catalog-name" className="sm:text-right text-xs text-muted-foreground">
              Product Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="catalog-name"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* Category */}
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] sm:items-start gap-1 sm:gap-3">
            <Label className="sm:text-right text-xs text-muted-foreground sm:pt-2.5">
              Category <span className="text-destructive">*</span>
            </Label>
            <div className="space-y-1.5">
              {addingNewCategory ? (
                <>
                  <Input
                    autoFocus
                    value={category}
                    placeholder="e.g. semen_extender"
                    onChange={(e) => setCategory(e.target.value)}
                    onBlur={(e) =>
                      setCategory(e.target.value.trim().toLowerCase().replace(/\s+/g, "_"))
                    }
                    className="h-9 text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">
                      Use lowercase with underscores (e.g. semen_extender).
                    </p>
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline"
                      onClick={() => { setAddingNewCategory(false); setCategory(""); }}
                    >
                      Pick existing
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select a category…" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {CATEGORY_LABELS[cat] ?? cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => { setAddingNewCategory(true); setCategory(""); }}
                  >
                    + Add new category
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Drug Name */}
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] sm:items-center gap-1 sm:gap-3">
            <Label htmlFor="catalog-drug" className="sm:text-right text-xs text-muted-foreground">
              Drug Name
            </Label>
            <Input
              id="catalog-drug"
              value={drugName}
              onChange={(e) => setDrugName(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* Doses per Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] sm:items-center gap-1 sm:gap-3">
            <Label htmlFor="catalog-doses" className="sm:text-right text-xs text-muted-foreground">
              Doses per Unit
            </Label>
            <Input
              id="catalog-doses"
              type="number"
              value={dosesPerUnit}
              placeholder="e.g. 10"
              onChange={(e) => setDosesPerUnit(e.target.value)}
              className={`h-9 text-sm ${NUMBER_INPUT_CLASS}`}
            />
          </div>

          {/* Unit Label */}
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] sm:items-center gap-1 sm:gap-3">
            <Label htmlFor="catalog-unit" className="sm:text-right text-xs text-muted-foreground">
              Unit Label
            </Label>
            <Input
              id="catalog-unit"
              value={unitLabel}
              placeholder="e.g. dose, cc, syringe"
              onChange={(e) => setUnitLabel(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* Default Price */}
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] sm:items-center gap-1 sm:gap-3">
            <Label htmlFor="catalog-price" className="sm:text-right text-xs text-muted-foreground">
              Default Price
            </Label>
            <Input
              id="catalog-price"
              type="number"
              step="0.01"
              value={defaultPrice}
              placeholder="0.00"
              onChange={(e) => setDefaultPrice(e.target.value)}
              className={`h-9 text-sm ${NUMBER_INPUT_CLASS}`}
            />
          </div>

          {/* QBO Item Name */}
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] sm:items-start gap-1 sm:gap-3">
            <Label htmlFor="catalog-qbo" className="sm:text-right text-xs text-muted-foreground sm:pt-2.5">
              QBO Item Name
            </Label>
            <div className="space-y-1">
              <Input
                id="catalog-qbo"
                value={qboItemName}
                onChange={(e) => setQboItemName(e.target.value)}
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Used when invoices sync to QuickBooks. Leave blank if not using QBO yet.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save to Catalog
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
