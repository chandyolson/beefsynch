import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TeamMemberSelectProps {
  value: string;
  onValueChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

const TeamMemberSelect = ({
  value,
  onValueChange,
  placeholder = "Select team member",
  className,
}: TeamMemberSelectProps) => {
  const { orgId } = useOrgRole();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team_member_select", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("organization_members") as any)
        .select("display_name")
        .eq("organization_id", orgId!)
        .eq("accepted", true)
        .not("display_name", "is", null)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { display_name: string }[];
    },
  });

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger className={cn(className)}>
          <SelectValue placeholder="Loading..." />
        </SelectTrigger>
      </Select>
    );
  }

  // Deduplicate display names
  const seen = new Set<string>();
  const unique = members.filter((m) => {
    if (!m.display_name || seen.has(m.display_name)) return false;
    seen.add(m.display_name);
    return true;
  });

  return (
    <Select value={value || undefined} onValueChange={onValueChange}>
      <SelectTrigger className={cn(className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {unique.length === 0 ? (
          <SelectItem value="__none__" disabled>
            No team members configured
          </SelectItem>
        ) : (
          unique.map((m) => (
            <SelectItem key={m.display_name} value={m.display_name}>
              {m.display_name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
};

export default TeamMemberSelect;
