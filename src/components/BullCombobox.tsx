import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface CatalogBull {
  id: string;
  bull_name: string;
  company: string;
}

interface BullComboboxProps {
  value: string;
  catalogId: string | null;
  onChange: (value: string, catalogId: string | null) => void;
}

const BullCombobox = ({ value, catalogId, onChange }: BullComboboxProps) => {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CatalogBull[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!query || query.length < 1) { setResults([]); return; }
    const timeout = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from("bulls_catalog")
        .select("id, bull_name, company")
        .eq("active", true)
        .ilike("bull_name", `%${query}%`)
        .limit(10);
      setResults(data ?? []);
      setLoading(false);
    }, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  const handleSelect = (bull: CatalogBull) => {
    onChange(bull.bull_name, bull.id);
    setQuery(bull.bull_name);
    setOpen(false);
  };

  const handleInputChange = (val: string) => {
    setQuery(val);
    onChange(val, null); // custom entry
    setOpen(true);
  };

  return (
    <div ref={wrapperRef} className="relative flex-1">
      <input
        type="text"
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => query && setOpen(true)}
        placeholder="Search or type bull name..."
        className="h-9 w-full rounded-md border border-border bg-secondary px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {catalogId && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-primary bg-primary/20 px-1.5 py-0.5 rounded">
          Catalog
        </span>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
          {results.map((bull) => (
            <button
              key={bull.id}
              type="button"
              onClick={() => handleSelect(bull)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-secondary transition-colors text-left"
            >
              <span className="text-foreground">{bull.bull_name}</span>
              <span className="text-xs text-muted-foreground">{bull.company}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default BullCombobox;
