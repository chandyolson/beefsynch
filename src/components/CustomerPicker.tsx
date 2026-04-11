import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandItem,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface CustomerPickerProps {
  value: string | null;
  onChange: (customerId: string | null) => void;
  orgId: string;
  className?: string;
}

const CustomerPicker = ({ value, onChange, orgId, className }: CustomerPickerProps) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-picker", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email")
        .eq("organization_id", orgId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [customers, search]);

  const selectedCustomer = customers.find((c) => c.id === value);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("customers")
      .insert({
        organization_id: orgId,
        name: newName.trim(),
        phone: newPhone.trim() || null,
        email: newEmail.trim() || null,
        address: newAddress.trim() || null,
      })
      .select("id, name")
      .single();
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["customers-picker"] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    onChange(data.id);
    setCreateOpen(false);
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setNewAddress("");
    toast({ title: "Customer created" });
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
            {selectedCustomer?.name || "Select customer..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search customers..." value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>No customers found.</CommandEmpty>
              {filtered.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")} />
                  <div>
                    <span className="font-medium">{c.name}</span>
                    {c.phone && <span className="text-xs text-muted-foreground ml-2">{c.phone}</span>}
                  </div>
                </CommandItem>
              ))}
              <CommandItem
                onSelect={() => {
                  setNewName(search);
                  setCreateOpen(true);
                  setOpen(false);
                }}
                className="text-primary"
              >
                <Plus className="mr-2 h-4 w-4" />
                + Add new customer{search.trim() ? `: ${search.trim()}` : ""}
              </CommandItem>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-[100px_1fr] items-center gap-x-4 gap-y-3">
            <Label className="text-right text-sm">Name *</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Label className="text-right text-sm">Phone</Label>
            <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            <Label className="text-right text-sm">Email</Label>
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <Label className="text-right text-sm">Address</Label>
            <Input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
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

export default CustomerPicker;
