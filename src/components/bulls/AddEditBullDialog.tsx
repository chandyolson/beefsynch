import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const COMPANIES_LIST = ["Select Sires", "ABS", "Universal", "Genex", "Other/Custom"] as const;

interface FormData {
  bull_name: string;
  company: string;
  naab_code: string;
  registration_number: string;
  breed: string;
  notes: string;
}

interface Bull {
  id: string;
  bull_name: string;
  company: string;
  registration_number: string;
  breed: string;
  naab_code: string | null;
  active: boolean;
  notes?: string | null;
}

interface AddEditBullDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  formData: FormData;
  onFormChange: (data: Partial<FormData>) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export default function AddEditBullDialog({
  open,
  onOpenChange,
  mode,
  formData,
  onFormChange,
  onSave,
  saving,
}: AddEditBullDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit Bull" : "Add Bull"}</DialogTitle>
          <DialogDescription>
            {mode === "edit" ? "Update bull details below." : "Enter bull details below."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[140px_1fr] items-center gap-x-4 gap-y-3">
            <Label className="text-right">Bull Name *</Label>
            <Input
              value={formData.bull_name}
              onChange={(e) => onFormChange({ bull_name: e.target.value })}
              placeholder="Bull name"
            />

            <Label className="text-right">Company</Label>
            <Select
              value={formData.company}
              onValueChange={(v) => onFormChange({ company: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPANIES_LIST.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label className="text-right">NAAB Code</Label>
            <Input
              value={formData.naab_code}
              onChange={(e) => onFormChange({ naab_code: e.target.value })}
              placeholder="Optional"
            />

            <Label className="text-right">Reg. Number</Label>
            <Input
              value={formData.registration_number}
              onChange={(e) => onFormChange({ registration_number: e.target.value })}
              placeholder="Optional"
            />

            <Label className="text-right">Breed</Label>
            <Input
              value={formData.breed}
              onChange={(e) => onFormChange({ breed: e.target.value })}
              placeholder="Optional"
            />

            <Label className="text-right self-start pt-2">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => onFormChange({ notes: e.target.value })}
              placeholder="Optional"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : mode === "edit" ? "Save Changes" : "Add Bull"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
