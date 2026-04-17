/**
 * Centralized route path constants
 * Prevents hardcoding route strings throughout the application
 */

// Public routes (no authentication required)
export const ROUTES = {
  // Auth & Access
  AUTH: "/auth",
  RESET_PASSWORD: "/reset-password",
  ACCEPT_INVITE: "/accept-invite",
  PRIVACY: "/privacy",
  TERMS: "/terms",

  // Root
  HOME: "/",

  // Onboarding & Protected
  ONBOARDING: "/onboarding",

  // Dashboard & Operations
  OPERATIONS: "/operations",
  DASHBOARD: "/dashboard", // Redirect to operations?tab=projects
  INVENTORY_HUB: "/inventory-hub", // Redirect to operations
  INVENTORY_DASHBOARD: "/inventory-dashboard", // Redirect to operations?tab=inventory
  TANKS_DASHBOARD: "/tanks-dashboard", // Redirect to operations?tab=tanks
  PACKS: "/packs", // Redirect to operations?tab=packing
  UNPACKS: "/unpacks", // Redirect to operations?tab=packing
  SHIPMENTS: "/shipments", // Redirect to operations?tab=receiving
  INVENTORY_LOG: "/inventory-log", // Redirect to operations?tab=log
  SEMEN_ORDERS: "/semen-orders", // Redirect to operations?tab=orders

  // Projects
  PROJECT: (id: string) => `/project/${id}`,
  PROJECT_BILLING: (id: string) => `/project/${id}/billing`,

  // Calendar & Planning
  CALENDAR: "/calendar",

  // Bulls
  BULLS: "/bulls",
  BULL_REPORT: "/bull-report",
  BULL_CHAT: "/chat",

  // Orders
  SEMEN_ORDERS_DETAIL: (id: string) => `/semen-orders/${id}`,

  // Customers
  CUSTOMERS: "/customers",
  CUSTOMER_DETAIL: (id: string) => `/customers/${id}`,

  // Tanks & Inventory
  TANKS: "/tanks",
  TANK_DETAIL: (id: string) => `/tanks/${id}`,
  TANK_REINVENTORY: (tankId: string) => `/tanks/${tankId}/reinventory`,
  TANK_FILLS: "/tank-fills",
  TANKS_OUT: "/tanks-out",
  SEMEN_INVENTORY: "/semen-inventory",

  // Receiving
  RECEIVE_SHIPMENT: "/receive-shipment",
  RECEIVE_SHIPMENT_DETAIL: (id: string) => `/receive-shipment/${id}`,
  RECEIVE_SHIPMENT_PREVIEW: (id: string) => `/receive-shipment/preview/${id}`,

  // Team
  TEAM_MANAGEMENT: "/team",

  // Packing & Unpacking
  PACK_TANK: "/pack-tank",
  PACK_DETAIL: (id: string) => `/pack/${id}`,
  UNPACK: (packId: string) => `/unpack/${packId}`,

  // Admin
  ADMIN_IMPORT_BULLS: "/admin/import-bulls",
} as const;

/**
 * URL query parameter names and helpers
 */
export const QUERY_PARAMS = {
  TAB: "tab",
  SORT: "sort",
  FILTER: "filter",
  SEARCH: "search",
  PAGE: "page",
} as const;

/**
 * Tab identifiers for operations dashboard
 */
export const OPERATION_TABS = {
  PROJECTS: "projects",
  INVENTORY: "inventory",
  TANKS: "tanks",
  PACKING: "packing",
  RECEIVING: "receiving",
  LOG: "log",
  ORDERS: "orders",
} as const;

/**
 * Helper to build query string with tab parameter
 * @param tab Tab name from OPERATION_TABS
 * @returns Query string like "?tab=projects"
 */
export function buildOperationsUrl(tab?: string): string {
  if (!tab) return ROUTES.OPERATIONS;
  return `${ROUTES.OPERATIONS}?${QUERY_PARAMS.TAB}=${tab}`;
}
