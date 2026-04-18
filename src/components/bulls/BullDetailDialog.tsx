import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ExternalLink } from "lucide-react";
import ClickableRegNumber from "@/components/ClickableRegNumber";

interface Bull {
  id: string;
  bull_name: string;
  company: string;
  registration_number: string;
  breed: string;
  naab_code: string | null;
  active: boolean;
  is_custom?: boolean;
  notes?: string | null;
}

interface BullDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bull: Bull | null;
  onEdit: (bull: Bull) => void;
  onDelete: (bull: Bull) => void;
  onViewReport: (bull: Bull) => void;
  deleting: boolean;
}

const selectSiresUrl = (bull: Bull): string | null => {
  if (!bull.company.toLowerCase().includes("select sires")) return null;
  const breedSlug = bull.breed.toLowerCase().replace(/\s+/g, "-");
  const nameSlug = bull.bull_name.toLowerCase().replace(/\s+/g, "-");
  return `https://selectsiresbeef.com/bull/${breedSlug}/${nameSlug}/`;
};

export default function BullDetailDialog({
  open,
  onOpenChange,
  bull,
  onEdit,
  onDelete,
  onViewReport,
  deleting,
}: BullDetailDialogProps) {
  if (!bull) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {bull.bull_name}
            {bull.is_custom && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground">
                Custom
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{bull.company} · {bull.breed}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm py-2">
          <span className="text-right text-muted-foreground">Registration</span>
          <span>
            <ClickableRegNumber
              registrationNumber={bull.registration_number}
              breed={bull.breed}
            />
          </span>

          <span className="text-right text-muted-foreground">NAAB Code</span>
          <span>{bull.naab_code || "—"}</span>

          <span className="text-right text-muted-foreground">Company</span>
          <span>{bull.company}</span>

          <span className="text-right text-muted-foreground">Breed</span>
          <span>{bull.breed}</span>

          <span className="text-right text-muted-foreground">Status</span>
          <span>{bull.active ? "Active" : "Inactive"}</span>

          {bull.notes && (
            <>
              <span className="text-right text-muted-foreground self-start">Notes</span>
              <span className="whitespace-pre-wrap">{bull.notes}</span>
            </>
          )}

          {selectSiresUrl(bull) && (
            <>
              <span className="text-right text-muted-foreground">Select Sires</span>
              <a
                href={selectSiresUrl(bull)!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                View on website <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onViewReport(bull);
            }}
          >
            View Report
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onEdit(bull);
            }}
          >
            Edit
          </Button>
          <Button
            variant="destructive"
            onClick={() => onDelete(bull)}
            disabled={deleting}
          >
            {deleting ? "Checking…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
