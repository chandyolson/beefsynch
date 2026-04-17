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
} from "@/components/ui/dialog";

interface AddTankDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tankNumber: string;
  setTankNumber: (value: string) => void;
  tankName: string;
  setTankName: (value: string) => void;
  tankEid: string;
  setTankEid: (value: string) => void;
  tankType: string;
  setTankType: (value: string) => void;
  tankStatus: string;
  setTankStatus: (value: string) => void;
  tankModel: string;
  setTankModel: (value: string) => void;
  tankSerial: string;
  setTankSerial: (value: string) => void;
  tankDesc: string;
  setTankDesc: (value: string) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export default function AddTankDialog({
  open,
  onOpenChange,
  tankNumber,
  setTankNumber,
  tankName,
  setTankName,
  tankEid,
  setTankEid,
  tankType,
  setTankType,
  tankStatus,
  setTankStatus,
  tankModel,
  setTankModel,
  tankSerial,
  setTankSerial,
  tankDesc,
  setTankDesc,
  onSave,
  saving,
}: AddTankDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Tank</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tank Number *</Label>
            <Input value={tankNumber} onChange={(e) => setTankNumber(e.target.value)} placeholder="e.g. T-001" />
          </div>
          <div className="space-y-1.5">
            <Label>Tank Name</Label>
            <Input value={tankName} onChange={(e) => setTankName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>EID</Label>
            <Input value={tankEid} onChange={(e) => setTankEid(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tank Type</Label>
              <Select value={tankType} onValueChange={setTankType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer_tank">Customer Tank</SelectItem>
                  <SelectItem value="rental_tank">Rental Tank</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={tankStatus} onValueChange={setTankStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wet">Wet</SelectItem>
                  <SelectItem value="dry">Dry</SelectItem>
                  <SelectItem value="out">Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Input value={tankModel} onChange={(e) => setTankModel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Serial Number</Label>
            <Input value={tankSerial} onChange={(e) => setTankSerial(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={tankDesc} onChange={(e) => setTankDesc(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving || !tankNumber.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
