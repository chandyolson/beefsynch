import { useMemo } from "react";
import { format } from "date-fns";
import { BullReportRow } from "@/lib/generateBullReportPdf";

interface ProjectBullJoin {
  units: number;
  custom_bull_name: string | null;
  bull_catalog_id: string | null;
  bulls_catalog: {
    bull_name: string;
    company: string;
    registration_number: string;
    breed: string;
  } | null;
  project_id: string;
  projects: {
    id: string;
    name: string;
    breeding_date: string | null;
    cattle_type: string;
    protocol: string;
    head_count: number;
    status: string;
  } | null;
}

interface OrderItemJoin {
  units: number;
  custom_bull_name: string | null;
  bull_catalog_id: string | null;
  bulls_catalog: {
    bull_name: string;
    company: string;
    registration_number: string;
    breed: string;
  } | null;
  semen_order_id: string;
  semen_orders: {
    id: string;
    customers: { name: string } | null;
    order_date: string;
  } | null;
}

type SortKey = "bullName" | "totalUnits" | "projectCount";
type SortDir = "asc" | "desc";
type DataSource = "all" | "projects" | "orders";

export function useBullReport(
  rawRows: ProjectBullJoin[],
  orderRows: OrderItemJoin[],
  appliedSearch: string,
  appliedCompany: string,
  appliedBreed: string,
  appliedSource: DataSource,
  sortKey: SortKey,
  sortDir: SortDir
) {
  const reportRows = useMemo(() => {
    const map = new Map<
      string,
      BullReportRow & {
        projectIds: Set<string>;
        orderIds: Set<string>;
        headSet: Map<string, number>;
        namesList: string[];
        datesList: string[];
        typesSet: Set<string>;
        fromProjects: boolean;
        fromOrders: boolean;
      }
    >();

    const getBullKey = (
      catalogId: string | null,
      catalog: { bull_name: string } | null,
      customName: string | null
    ) => {
      return catalogId && catalog
        ? `catalog_${catalogId}`
        : `custom_${customName ?? "unknown"}`;
    };

    const initEntry = (key: string, bullName: string, co: string, regNum: string, breed: string) => {
      if (!map.has(key)) {
        map.set(key, {
          bullName,
          company: co,
          registrationNumber: regNum,
          breed,
          totalUnits: 0,
          projectCount: 0,
          projectNames: "",
          breedingDates: "",
          cattleTypes: "",
          source: "Project",
          projectIds: new Set(),
          orderIds: new Set(),
          headSet: new Map(),
          namesList: [],
          datesList: [],
          typesSet: new Set(),
          fromProjects: false,
          fromOrders: false,
        });
      }
      return map.get(key)!;
    };

    // Process project bulls
    if (appliedSource !== "orders") {
      for (const row of rawRows) {
        const proj = row.projects;
        if (!proj) continue;
        const isCatalog = !!row.bull_catalog_id && !!row.bulls_catalog;
        const key = getBullKey(row.bull_catalog_id, row.bulls_catalog, row.custom_bull_name);
        const bullName = isCatalog ? row.bulls_catalog!.bull_name : row.custom_bull_name ?? "Unknown";
        const co = isCatalog ? (row.bulls_catalog!.company || "") : "";
        const regNum = isCatalog ? (row.bulls_catalog!.registration_number || "") : "";
        const br = isCatalog ? (row.bulls_catalog!.breed || "") : "";

        if (appliedCompany !== "All Companies" && co !== appliedCompany) continue;
        if (appliedBreed !== "All Breeds" && br !== appliedBreed) continue;
        const q = appliedSearch.toLowerCase();
        if (q && !bullName.toLowerCase().includes(q) && !proj.name.toLowerCase().includes(q)) continue;

        const entry = initEntry(key, bullName, co, regNum, br);
        entry.totalUnits += row.units;
        entry.fromProjects = true;

        if (!entry.projectIds.has(proj.id)) {
          entry.projectIds.add(proj.id);
          entry.headSet.set(proj.id, proj.head_count);
          entry.namesList.push(proj.name);
          if (proj.breeding_date) {
            entry.datesList.push(format(new Date(proj.breeding_date + "T00:00:00"), "M/d/yyyy"));
          }
          entry.typesSet.add(proj.cattle_type);
        }
      }
    }

    // Process order items
    if (appliedSource !== "projects") {
      for (const row of orderRows) {
        const ord = row.semen_orders;
        if (!ord) continue;
        const isCatalog = !!row.bull_catalog_id && !!row.bulls_catalog;
        const key = getBullKey(row.bull_catalog_id, row.bulls_catalog, row.custom_bull_name);
        const bullName = isCatalog ? row.bulls_catalog!.bull_name : row.custom_bull_name ?? "Unknown";
        const co = isCatalog ? (row.bulls_catalog!.company || "") : "";
        const regNum = isCatalog ? (row.bulls_catalog!.registration_number || "") : "";
        const br = isCatalog ? (row.bulls_catalog!.breed || "") : "";

        if (appliedCompany !== "All Companies" && co !== appliedCompany) continue;
        if (appliedBreed !== "All Breeds" && br !== appliedBreed) continue;
        const q = appliedSearch.toLowerCase();
        if (q && !bullName.toLowerCase().includes(q) && !(ord.customers?.name || "").toLowerCase().includes(q))
          continue;

        const entry = initEntry(key, bullName, co, regNum, br);
        entry.totalUnits += row.units;
        entry.fromOrders = true;

        if (!entry.orderIds.has(ord.id)) {
          entry.orderIds.add(ord.id);
          entry.namesList.push(`Order: ${ord.customers?.name || "Unknown"}`);
          entry.datesList.push(format(new Date(ord.order_date + "T00:00:00"), "M/d/yyyy"));
        }
      }
    }

    // Finalize
    const result: BullReportRow[] = [];
    for (const [, entry] of map.entries()) {
      entry.projectCount = entry.projectIds.size + entry.orderIds.size;
      if (entry.namesList.length === 0) continue;

      entry.source = entry.fromProjects && entry.fromOrders
        ? "Both"
        : entry.fromProjects
          ? "Project"
          : "Order";

      result.push({
        bullName: entry.bullName,
        company: entry.company,
        registrationNumber: entry.registrationNumber,
        breed: entry.breed,
        totalUnits: entry.totalUnits,
        projectCount: entry.projectCount,
        projectNames: entry.namesList.join(", "),
        breedingDates: entry.datesList.join(", "),
        cattleTypes: [...entry.typesSet].join(", "),
        source: entry.source,
      });
    }

    // Sort
    result.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortKey === "bullName") {
        av = a.bullName.toLowerCase();
        bv = b.bullName.toLowerCase();
      } else if (sortKey === "totalUnits") {
        av = a.totalUnits;
        bv = b.totalUnits;
      } else {
        av = a.projectCount;
        bv = b.projectCount;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [rawRows, orderRows, appliedSearch, appliedCompany, appliedBreed, appliedSource, sortKey, sortDir]);

  return reportRows;
}
