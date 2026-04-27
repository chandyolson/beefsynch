import React, { useState, useEffect } from "react";
import { Pencil, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";

interface OverrideButtonProps {
  /** Currently displayed/effective value */
  currentValue: number | null;
  /** The auto-calculated value (what we'd revert to) */
  calculatedValue: number | null;
  /** Whether this line currently has an override */
  hasOverride: boolean;
  /** Existing override metadata for tooltip */
  overrideReason?: string | null;
  overriddenAt?: string | null;
  overriddenByUserId?: string | null;
  /** Save handler — passes new value (null = clear override), reason, and audit fields */
  onSave: (value: number | null, reason: string | null) => Promise<void> | void;
  /** Display label for the metric (e.g. "doses", "head", "units") */
  unitLabel?: string;
  disabled?: boolean;
}

const MIN_REASON_LEN = 10;

export default function OverrideButton({
  currentValue, calculatedValue, hasOverride,
  overrideReason, overriddenAt, overriddenByUserId,
  onSave, unitLabel = "units", disabled,
}: OverrideButtonProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [overriderName, setOverriderName] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(currentValue != null ? String(currentValue) : "");
      setReason(overrideReason || "");
    }
  }, [open, currentValue, overrideReason]);

  // Resolve display name for tooltip
  useEffect(() => {
    if (!overriddenByUserId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any).auth.admin?.getUserById?.(overriddenByUserId).catch(() => ({ data: null }));
      if (!cancelled && data?.user?.email) setOverriderName(data.user.email);
    })();
    return () => { cancelled = true; };
  }, [overriddenByUserId]);

  const reasonValid = reason.trim().length >= MIN_REASON_LEN;
  const numValue = value === "" ? null : Number(value);
  const valueChanged = numValue !== currentValue;

  async function handleSave() {
    if (numValue == null) return;
    if (!reasonValid) return;
    setSaving(true);
    try {
      await onSave(numValue, reason.trim());
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await onSave(null, null);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const tooltipText = hasOverride
    ? `Override: ${overrideReason || "(no reason given)"}${
        overriddenAt ? ` — ${new Date(overriddenAt).toLocaleDateString()}` : ""
      }${overriderName ? ` by ${overriderName}` : ""}`
    : "Set manual override";

  return (
    <div className="inline-flex items-center gap-1">
      {hasOverride && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 font-medium inline-flex items-center gap-0.5 cursor-help">
                <AlertCircle className="h-2.5 w-2.5" />
                Override
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">{tooltipText}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={disabled}
            title={hasOverride ? "Edit override" : "Override quantity"}>
            <Pencil className="h-3 w-3" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{hasOverride ? "Edit override" : "Manual override"}</DialogTitle>
            <DialogDescription className="text-xs">
              Calculated value: <span className="font-medium">{calculatedValue ?? "—"}</span>
              {" "}{unitLabel}. Override replaces the calculated value for invoicing and totals.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="override-value" className="text-xs">Override quantity ({unitLabel})</Label>
              <Input id="override-value" type="number" step="0.01" className="mt-1"
                value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            </div>
            <div>
              <Label htmlFor="override-reason" className="text-xs">
                Reason for override <span className="text-muted-foreground">(required, min {MIN_REASON_LEN} chars)</span>
              </Label>
              <Textarea id="override-reason" className="mt-1 min-h-[80px]"
                value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Gun warmer failed mid-session, only 39 head bred."/>
              <p className={`text-[10px] mt-1 ${reasonValid ? "text-muted-foreground" : "text-amber-600"}`}>
                {reason.trim().length} / {MIN_REASON_LEN} characters
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            {hasOverride && (
              <Button type="button" variant="outline" onClick={handleClear} disabled={saving}
                className="mr-auto text-destructive hover:text-destructive">
                Clear override
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave}
              disabled={saving || !reasonValid || numValue == null || !valueChanged}>
              {saving ? "Saving..." : "Save override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
