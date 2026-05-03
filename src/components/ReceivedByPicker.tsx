import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandItem,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

interface ReceivedByPickerProps {
  value: string | null;
  onChange: (memberId: string | null) => void;
  orgId: string;
  className?: string;
}

interface MemberOption {
  id: string;
  label: string;
  role: string;
}

const ReceivedByPicker = ({ value, onChange, orgId, className }: ReceivedByPickerProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: members = [] } = useQuery({
    queryKey: ["received-by-picker", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<MemberOption[]> => {
      const { data, error } = await supabase.rpc("get_org_members", { _organization_id: orgId });
      if (error) throw error;
      return (data ?? [])
        .filter((member) => member.accepted)
        .map((member) => ({
          id: member.id,
          label: member.email || member.invited_email || "Unknown member",
          role: member.role,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter((member) => member.label.toLowerCase().includes(q));
  }, [members, search]);

  const selectedMember = members.find((member) => member.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          {selectedMember?.label || "Select team member..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search team members..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No team members found.</CommandEmpty>
            {filtered.map((member) => (
              <CommandItem
                key={member.id}
                value={member.id}
                onSelect={() => {
                  onChange(member.id);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === member.id ? "opacity-100" : "opacity-0")} />
                <div>
                  <span className="font-medium">{member.label}</span>
                  <span className="ml-2 text-xs capitalize text-muted-foreground">{member.role}</span>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default ReceivedByPicker;