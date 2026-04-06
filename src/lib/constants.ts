/** Fulfillment status badge colors (semen orders) */
export const FULFILLMENT_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  backordered: "bg-red-500/20 text-red-300 border-red-500/30",
  "partially filled": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  ordered: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  shipped: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  delivered: "bg-green-500/20 text-green-300 border-green-500/30",
};

/** Billing status badge colors (semen orders) */
export const BILLING_COLORS: Record<string, string> = {
  unbilled: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  invoiced: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  paid: "bg-green-500/20 text-green-300 border-green-500/30",
};

/** Project status badge colors */
export const PROJECT_STATUS_COLORS: Record<string, string> = {
  Tentative: "bg-warning/20 text-warning",
  Confirmed: "bg-primary/20 text-primary",
  Complete: "bg-emerald-500 text-white",
};

/** Billing sheet status colors */
export const BILLING_STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-warning/20 text-warning",
  invoiced: "bg-primary/20 text-primary",
  paid: "bg-emerald-500 text-white",
};
