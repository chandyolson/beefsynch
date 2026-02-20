import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const cowProtocols = [
  "Select Synch CIDR",
  "Select Synch TOO",
  "Select Synch",
  "7&7 Synch",
];

const heiferProtocols = [
  "7 Day CIDR",
  "7&7 Synch",
  "MGA",
  "14 Day CIDR",
];

const formSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(200),
  cattle_type: z.enum(["Heifers", "Cows"]),
  protocol: z.string().min(1, "Protocol is required"),
  head_count: z.coerce.number().int().min(1, "Must be at least 1"),
  breeding_date: z.date({ required_error: "Breeding date is required" }),
  breeding_time: z.string().default("10:00"),
  status: z.enum(["Tentative", "Confirmed", "Complete"]).default("Tentative"),
  notes: z.string().max(2000).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: () => void;
}

const NewProjectDialog = ({ open, onOpenChange, onProjectCreated }: NewProjectDialogProps) => {
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      cattle_type: "Heifers",
      protocol: "",
      head_count: undefined as unknown as number,
      breeding_time: "10:00",
      status: "Tentative",
      notes: "",
    },
  });

  const cattleType = form.watch("cattle_type");
  const protocols = cattleType === "Cows" ? cowProtocols : heiferProtocols;

  // Reset protocol when cattle type changes
  const handleCattleTypeChange = (type: "Heifers" | "Cows") => {
    form.setValue("cattle_type", type);
    form.setValue("protocol", "");
  };

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("projects").insert({
        name: values.name,
        cattle_type: values.cattle_type,
        protocol: values.protocol,
        head_count: values.head_count,
        breeding_date: format(values.breeding_date, "yyyy-MM-dd"),
        breeding_time: values.breeding_time,
        status: values.status,
        notes: values.notes || null,
      });

      if (error) throw error;

      toast({ title: "Project created", description: `"${values.name}" has been saved.` });
      form.reset();
      onOpenChange(false);
      onProjectCreated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">New Breeding Project</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Project Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Spring Heifer Group A" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Cattle Type Toggle */}
            <FormField
              control={form.control}
              name="cattle_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cattle Type</FormLabel>
                  <div className="flex rounded-md border border-border bg-secondary p-0.5">
                    {(["Heifers", "Cows"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleCattleTypeChange(type)}
                        className={cn(
                          "flex-1 rounded px-4 py-2 text-sm font-medium transition-colors",
                          field.value === type
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Protocol */}
            <FormField
              control={form.control}
              name="protocol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Protocol</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a protocol" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {protocols.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Head Count & Status row */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="head_count"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Head Count</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {["Tentative", "Confirmed", "Complete"].map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Breeding Date & Time row */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="breeding_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Breeding Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="breeding_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Breeding Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Optional notes..." rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Project"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default NewProjectDialog;
