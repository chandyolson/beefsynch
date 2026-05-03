import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import BullCombobox from "@/components/BullCombobox";
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
} from "@/components/ui/dialog";

interface AddSemenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semenCanister: string;
  setSemenCanister: (value: string) => void;
  semenSubCanister: string;
  setSemenSubCanister: (value: string) => void;
  semenBullName: string;
  setSemenBullName: (value: string) => void;
  semenBullCatalogId: string | null;
  setSemenBullCatalogId: (value: string | null) => void;
  semenBullCode: string;
  setSemenBullCode: (value: string) => void;
  semenUnits: string;
  setSemenUnits: (value: string) => void;
  semenStorageType: string;
  setSemenStorageType: (value: string) => void;
  semenNotes: string;
  setSemenNotes: (value: string) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export default function AddSemenDialog({
  open,
  onOpenChange,
  semenCanister,
  setSemenCanister,
  semenSubCanister,
  setSemenSubCanister,
  semenBullName,
  setSemenBullName,
  semenBullCatalogId,
  setSemenBullCatalogId,
  semenBullCode,
  setSemenBullCode,
  semenUnits,
  setSemenUnits,
  semenStorageType,
  setSemenStorageType,
  semenNotes,
  setSemenNotes,
  onSave,
  saving,
}: AddSemenDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Semen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Canister *</Label>
            <Input value={semenCanister} onChange={(e) => setSemenCanister(e.target.value)} placeholder="e.g. 1" />
          </div>
          <div className="space-y-1.5">
            <Label>Sub-canister</Label>
            <Input value={semenSubCanister} onChange={(e) => setSemenSubCanister(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Bull</Label>
            <BullCombobox
              value={semenBullName}
              catalogId={semenBullCatalogId}
              onChange={(name, catId) => {
                setSemenBullName(name);
                setSemenBullCatalogId(catId);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bull Code</Label>
            <Input value={semenBullCode} onChange={(e) => setSemenBullCode(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Units</Label>
              <Input type="number" value={semenUnits} onChange={(e) => setSemenUnits(e.target.value)} min="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Storage Type</Label>
              <Select value={semenStorageType} onValueChange={setSemenStorageType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="communal">Communal</SelectItem>
                  <SelectItem value="rental">Rental</SelectItem>
                  <SelectItem value="inventory">Inventory</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={semenNotes} onChange={(e) => setSemenNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving || !semenCanister.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
