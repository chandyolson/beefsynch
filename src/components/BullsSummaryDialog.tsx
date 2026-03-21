import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Beef } from "lucide-react";
import { useMemo } from "react";

interface BullsSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bullsByProject: Record<string, { name: string; units: number; registrationNumber?: string; breed?: string }[]>;
  projects: { id: string; name: string }[];
}

interface AggregatedBull {
  name: string;
  totalUnits: number;
  projectCount: number;
  registrationNumber?: string;
  breed?: string;
  projects: string[];
}

const BullsSummaryDialog = ({ open, onOpenChange, bullsByProject, projects }: BullsSummaryDialogProps) => {
  const projectNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) map[p.id] = p.name;
    return map;
  }, [projects]);

  const aggregated = useMemo(() => {
    const map = new Map<string, AggregatedBull>();
    for (const [projectId, bulls] of Object.entries(bullsByProject)) {
      for (const b of bulls) {
        const key = b.name;
        const existing = map.get(key);
        if (existing) {
          existing.totalUnits += b.units;
          existing.projectCount += 1;
          existing.projects.push(projectNameMap[projectId] || projectId);
        } else {
          map.set(key, {
            name: b.name,
            totalUnits: b.units,
            projectCount: 1,
            registrationNumber: b.registrationNumber,
            breed: b.breed,
            projects: [projectNameMap[projectId] || projectId],
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalUnits - a.totalUnits);
  }, [bullsByProject, projectNameMap]);

  const totalUnits = aggregated.reduce((s, b) => s + b.totalUnits, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Beef className="h-5 w-5 text-primary" />
            Bulls in Use — Summary
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between text-sm text-muted-foreground border-b border-border pb-2 mb-3">
          <span>{aggregated.length} distinct bull{aggregated.length !== 1 ? "s" : ""}</span>
          <span>{totalUnits} total units</span>
        </div>

        {aggregated.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">No bulls assigned to any project yet.</p>
        ) : (
          <div className="space-y-3">
            {aggregated.map((bull) => (
              <div key={bull.name} className="rounded-lg border border-border bg-secondary/50 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground text-sm">{bull.name}</span>
                  <span className="text-xs font-medium text-primary">{bull.totalUnits} units</span>
                </div>
                {(bull.breed || bull.registrationNumber) && (
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    {bull.breed && <span>{bull.breed}</span>}
                    {bull.registrationNumber && <span>Reg# {bull.registrationNumber}</span>}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {bull.projectCount} project{bull.projectCount !== 1 ? "s" : ""}: {bull.projects.join(", ")}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BullsSummaryDialog;
