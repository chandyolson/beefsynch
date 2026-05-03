import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup, CommandSeparator,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface SemenCompanyPickerProps {
  value: string | null;
  onChange: (companyId: string | null) => void;
  orgId: string;
  className?: string;
}

const SemenCompanyPicker = ({ value, onChange, orgId, className }: SemenCompanyPickerProps) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: companies = [] } = useQuery({
    queryKey: ["semen-companies-picker", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("semen_companies")
        .select("id, name")
        .eq("organization_id", orgId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter((company) => company.name.toLowerCase().includes(q));
  }, [companies, search]);

  const selectedCompany = companies.find((company) => company.id === value);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("semen_companies")
      .insert({
        organization_id: orgId,
        name: newName.trim(),
      })
      .select("id, name")
      .single();
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["semen-companies-picker"] });
    queryClient.invalidateQueries({ queryKey: ["semen_companies"] });
    onChange(data.id);
    setCreateOpen(false);
    setNewName("");
    setSearch("");
    toast({ title: "Company created" });
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className={cn("w-full justify-between font-normal", !value && "text-muted-foreground", className)}
          >
            {selectedCompany?.name || "Select company..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search companies..." value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandGroup>
                <CommandItem
                  value="__create_new__"
                  onSelect={() => {
                    setNewName(search);
                    setCreateOpen(true);
                    setOpen(false);
                  }}
                  className="text-primary font-medium cursor-pointer"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {search.trim() ? `Add "${search.trim()}"` : "Add new company"}
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandEmpty>No companies found.</CommandEmpty>
              {filtered.map((company) => (
                <CommandItem
                  key={company.id}
                  value={company.id}
                  onSelect={() => {
                    onChange(company.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === company.id ? "opacity-100" : "opacity-0")} />
                  <span className="font-medium">{company.name}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Semen Company</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-[100px_1fr] items-center gap-x-4 gap-y-3">
            <Label className="text-right text-sm">Name *</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !newName.trim()}>
              {saving ? "Saving..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SemenCompanyPicker;