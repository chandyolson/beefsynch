import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface InventoryRow {
  id: string;
  custom_bull_name: string | null;
  bull_catalog_id: string | null;
  bull_code: string | null;
  canister: string | null;
  units: number;
  catalog_bull_name: string | null;
}

interface InventoryBullPickerProps {
  sourceTankId: string;
  organizationId: string;
  value: string;
  onChange: (updates: {
    bullName: string;
    bullCatalogId: string | null;
    bullCode: string | null;
    sourceCanister: string;
    availableUnits: number | null;
  }) => void;
  customerId?: string;
}

const InventoryBullPicker = ({ sourceTankId, organizationId, value, onChange, customerId }: InventoryBullPickerProps) => {
  const [query, setQuery] = useState(value);
  const [allInventory, setAllInventory] = useState<InventoryRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastSentValue = useRef(value);

  useEffect(() => {
    if (value !== lastSentValue.current) {
      setQuery(value);
      lastSentValue.current = value;
    }
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const formatRows = (data: any[] | null): InventoryRow[] => {
    if (!data) return [];
    return data.map((row: any) => ({
      id: row.id,
      custom_bull_name: row.custom_bull_name,
      bull_catalog_id: row.bull_catalog_id,
      bull_code: row.bull_code,
      canister: row.canister,
      units: row.units,
      catalog_bull_name: row.bulls_catalog?.bull_name || null,
    }));
  };

  useEffect(() => {
    if (!sourceTankId || !organizationId) {
      setAllInventory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("tank_inventory")
        .select("id, custom_bull_name, bull_catalog_id, bull_code, canister, units, bulls_catalog(bull_name)")
        .eq("tank_id", sourceTankId)
        .eq("organization_id", organizationId)
        .eq("item_type", "semen")
        .gt("units", 0);
      if (customerId) q = q.eq("customer_id", customerId);
      const { data } = await q.limit(200);
      if (!cancelled) {
        setAllInventory(formatRows(data));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sourceTankId, organizationId, customerId]);

  const results = useMemo(() => {
    if (!allInventory.length) return [];

    const withDisplay = allInventory.map((row) => ({
      ...row,
      _display: (row.catalog_bull_name || row.custom_bull_name || "Unknown").toLowerCase(),
    }));

    let filtered = withDisplay;
    if (query && query.length >= 1) {
      const lower = query.toLowerCase();
      filtered = withDisplay.filter(
        (row) =>
          row._display.includes(lower) ||
          (row.bull_code && row.bull_code.toLowerCase().includes(lower))
      );
    }

    filtered.sort((a, b) => {
      const nameCompare = a._display.localeCompare(b._display);
      if (nameCompare !== 0) return nameCompare;
      const aCan = parseInt(a.canister || "0") || 0;
      const bCan = parseInt(b.canister || "0") || 0;
      return aCan - bCan;
    });

    return filtered;
  }, [allInventory, query]);

  const displayName = (row: InventoryRow): string => {
    return row.catalog_bull_name || row.custom_bull_name || "Unknown";
  };

  const handleSelect = (row: InventoryRow) => {
    const name = row.custom_bull_name || row.catalog_bull_name || "Unknown";
    const display = row.bull_code ? `${name} (${row.bull_code})` : name;
    setQuery(display);
    lastSentValue.current = display;
    onChange({
      bullName: name,
      bullCatalogId: row.bull_catalog_id,
      bullCode: row.bull_code,
      sourceCanister: row.canister || "",
      availableUnits: row.units,
    });
    setOpen(false);
  };

  const handleInputChange = (val: string) => {
    setQuery(val);
    lastSentValue.current = val;
    onChange({
      bullName: val,
      bullCatalogId: null,
      bullCode: null,
      sourceCanister: "",
      availableUnits: null,
    });
    setOpen(true);
  };

  return (
    <div ref={wrapperRef} className="relative flex-1">
      <input
        type="text"
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => sourceTankId && setOpen(true)}
        placeholder={sourceTankId ? "Search inventory…" : "Select source tank first"}
        disabled={!sourceTankId}
        aria-label="Search semen inventory"
        aria-expanded={open}
        role="combobox"
        aria-autocomplete="list"
        className="h-9 w-full rounded-md border border-border bg-secondary px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      />
      {open && results.length > 0 && (
        <div
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto"
          role="listbox"
          aria-label="Inventory search results"
        >
          {results.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => handleSelect(row)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-secondary transition-colors text-left"
            >
              <span className="flex items-center gap-1.5 text-foreground">
                {displayName(row)}
                {row.bull_code ? <span className="text-xs text-muted-foreground">({row.bull_code})</span> : null}
              </span>
              <span className="text-xs text-muted-foreground">
                Can {row.canister || "?"} · {row.units}u
              </span>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && sourceTankId && !loading && query.length >= 1 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg px-3 py-2 text-sm text-muted-foreground">
          No inventory found in this tank
        </div>
      )}
    </div>
  );
};

export default InventoryBullPicker;
