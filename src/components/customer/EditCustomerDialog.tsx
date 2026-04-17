import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EditCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: {
    id: string;
    name: string;
    company_name: string | null;
    phone: string | null;
    email: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    notes: string | null;
  } | null;
  formName: string;
  setFormName: (value: string) => void;
  formCompanyName: string;
  setFormCompanyName: (value: string) => void;
  formPhone: string;
  setFormPhone: (value: string) => void;
  formEmail: string;
  setFormEmail: (value: string) => void;
  formAddressLine1: string;
  setFormAddressLine1: (value: string) => void;
  formAddressLine2: string;
  setFormAddressLine2: (value: string) => void;
  formCity: string;
  setFormCity: (value: string) => void;
  formState: string;
  setFormState: (value: string) => void;
  formZip: string;
  setFormZip: (value: string) => void;
  formNotes: string;
  setFormNotes: (value: string) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export default function EditCustomerDialog({
  open,
  onOpenChange,
  customer,
  formName,
  setFormName,
  formCompanyName,
  setFormCompanyName,
  formPhone,
  setFormPhone,
  formEmail,
  setFormEmail,
  formAddressLine1,
  setFormAddressLine1,
  formAddressLine2,
  setFormAddressLine2,
  formCity,
  setFormCity,
  formState,
  setFormState,
  formZip,
  setFormZip,
  formNotes,
  setFormNotes,
  onSave,
  saving,
}: EditCustomerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[140px_1fr] items-center gap-x-4 gap-y-3">
          <Label className="text-right text-sm">Display Name *</Label>
          <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
          <Label className="text-right text-sm">Company Name</Label>
          <Input value={formCompanyName} onChange={(e) => setFormCompanyName(e.target.value)} />
          <Label className="text-right text-sm">Email</Label>
          <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
          <Label className="text-right text-sm">Phone</Label>
          <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
          <Label className="text-right text-sm">Address Line 1</Label>
          <Input value={formAddressLine1} onChange={(e) => setFormAddressLine1(e.target.value)} />
          <Label className="text-right text-sm">Address Line 2</Label>
          <Input value={formAddressLine2} onChange={(e) => setFormAddressLine2(e.target.value)} />
          <Label className="text-right text-sm">City / State / Zip</Label>
          <div className="grid grid-cols-[1fr_60px_100px] gap-2">
            <Input value={formCity} onChange={(e) => setFormCity(e.target.value)} placeholder="City" />
            <Input value={formState} onChange={(e) => setFormState(e.target.value)} placeholder="ST" maxLength={2} />
            <Input value={formZip} onChange={(e) => setFormZip(e.target.value)} placeholder="Zip" />
          </div>
          <Label className="text-right text-sm">Notes</Label>
          <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving || !formName.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
