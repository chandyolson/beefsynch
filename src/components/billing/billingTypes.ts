/* ── Billing shared types, constants, and helpers ── */

export interface BillingProduct {
  id: string;
  product_name: string;
  product_category: string;
  drug_name: string | null;
  doses_per_unit: number | null;
  unit_label: string | null;
  default_price: number | null;
  is_default: boolean | null;
  sort_order: number | null;
}

export interface ProductLine {
  id?: string;
  billing_id: string;
  billing_product_id: string | null;
  product_name: string;
  product_category: string | null;
  protocol_event_label: string | null;
  event_date: string | null;
  doses: number;
  doses_per_unit: number | null;
  unit_label: string | null;
  units_calculated: number | null;
  units_billed: number | null;
  units_returned: number | null;
  unit_price: number | null;
  line_total: number | null;
  sort_order: number | null;
  invoiced?: boolean;
  invoiced_at?: string | null;
  session_id?: string | null;
}

export interface SessionLine {
  id?: string;
  billing_id: string;
  session_date: string;
  session_label: string | null;
  time_of_day: string | null;
  head_count: number | null;
  crew: string | null;
  notes: string | null;
  sort_order: number | null;
  invoiced?: boolean;
  invoiced_at?: string | null;
  session_type?: string | null;
}

export interface SessionInventoryLine {
  id?: string;
  billing_id: string;
  session_id: string;
  bull_catalog_id: string | null;
  bull_name: string;
  bull_code: string | null;
  canister: string;
  start_units: number | null;
  end_units: number | null;
  blown_units: number | null;
  returned_units: number | null;
  sort_order: number | null;
}

export interface SemenLine {
  id?: string;
  billing_id: string;
  bull_catalog_id: string | null;
  bull_name: string;
  bull_code: string | null;
  units_packed: number | null;
  units_returned: number | null;
  units_blown: number | null;
  units_billable: number | null;
  unit_price: number | null;
  line_total: number | null;
  sort_order: number | null;
  invoiced?: boolean;
  invoiced_at?: string | null;
}

/* ── Constants ── */

export const STATUS_COLORS: Record<string, string> = {
  in_process: "bg-blue-500/20 text-blue-600",
  work_complete: "bg-amber-500/20 text-amber-600",
  invoiced_closed: "bg-emerald-500/20 text-emerald-600",
};

export const BILLING_STATUSES = ["in_process", "work_complete", "invoiced_closed"];

export const STATUS_LABELS: Record<string, string> = {
  in_process: "In Process",
  work_complete: "Work Complete",
  invoiced_closed: "Invoiced & Closed",
};

/* ── Helpers ── */

export function calcUnits(doses: number, dpu: number | null) {
  if (!dpu || dpu <= 0) return doses;
  return doses / dpu;
}

export function formatCurrency(v: number | null) {
  if (v == null) return "$0.00";
  return `$${v.toFixed(2)}`;
}

export function formatTime12(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function isBreedingSession(s: SessionLine) {
  const label = (s.session_label || "").toLowerCase();
  return label.includes("breed") || label.includes("ai ") || label === "ai" || label.includes("tai");
}

export function toggleSetItem<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) next.delete(item); else next.add(item);
  return next;
}
