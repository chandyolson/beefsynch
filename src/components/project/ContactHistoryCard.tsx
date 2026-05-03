import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Calendar, Plus, Trash2, UserCheck } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface OrgMember {
  id: string;
  user_id: string | null;
  email: string | null;
}

interface Contact {
  id: string;
  contact_date: string;
  contacted_by: string;
  notes: string | null;
}

interface ContactHistoryCardProps {
  contacts: Contact[];
  contactEditing: boolean;
  contactDate: Date | undefined;
  setContactDate: (date: Date | undefined) => void;
  contactBy: string;
  setContactBy: (value: string) => void;
  contactNotes: string;
  setContactNotes: (value: string) => void;
  orgMembers: OrgMember[];
  datePickerOpen: boolean;
  setDatePickerOpen: (open: boolean) => void;
  onQuickLog: () => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  onDeleteContact: (contactId: string) => void;
  contactSaving: boolean;
  resolveContactEmail: (uid: string | null) => string;
  orgRole: string;
}

export default function ContactHistoryCard({
  contacts,
  contactEditing,
  contactDate,
  setContactDate,
  contactBy,
  setContactBy,
  contactNotes,
  setContactNotes,
  orgMembers,
  datePickerOpen,
  setDatePickerOpen,
  onQuickLog,
  onSave,
  onCancel,
  onDeleteContact,
  contactSaving,
  resolveContactEmail,
  orgRole,
}: ContactHistoryCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-muted-foreground" />
          Contact History
        </CardTitle>
        {!contactEditing && (
          <Button size="sm" onClick={onQuickLog} disabled={contactSaving} className="gap-1">
            <Plus className="h-4 w-4" /> Log Contact
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {contactEditing && (
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Date</label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !contactDate && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="h-4 w-4 mr-2 opacity-50" />
                      {contactDate ? format(contactDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={contactDate}
                      onSelect={(d) => {
                        setContactDate(d);
                        setDatePickerOpen(false);
                      }}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Contacted By</label>
                <Select value={contactBy} onValueChange={setContactBy}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgMembers.map((m) => (
                      <SelectItem key={m.user_id!} value={m.user_id!}>
                        {m.email ?? "Unknown"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Notes</label>
              <Textarea
                value={contactNotes}
                onChange={(e) => setContactNotes(e.target.value)}
                placeholder="What was discussed? Key decisions, follow-ups, etc."
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={onSave} disabled={contactSaving || !contactDate || !contactBy}>
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {contacts.length === 0 && !contactEditing ? (
          <p className="text-sm text-muted-foreground">No contacts logged yet.</p>
        ) : contacts.length > 0 && (
          <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
            {contacts.map((c) => (
              <div key={c.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {format(parseISO(c.contact_date), "MMM d, yyyy")}
                      <span className="text-muted-foreground font-normal">
                        {" "}· {resolveContactEmail(c.contacted_by)}
                      </span>
                    </p>
                    {c.notes && (
                      <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{c.notes}</p>
                    )}
                  </div>
                  {(orgRole === "owner" || orgRole === "admin") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => onDeleteContact(c.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
