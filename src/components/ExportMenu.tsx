import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExportConfig, exportToCsv, exportToPdf } from "@/lib/exports";

type Props<T> = {
  config: ExportConfig<T>;
  rows: T[];
  /** Disable when there are no rows. Default true. */
  disableWhenEmpty?: boolean;
  variant?: "outline" | "default" | "ghost";
  size?: "sm" | "default" | "lg";
};

export function ExportMenu<T>({
  config,
  rows,
  disableWhenEmpty = true,
  variant = "outline",
  size = "sm",
}: Props<T>) {
  const disabled = disableWhenEmpty && rows.length === 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportToCsv(config, rows)}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export as CSV ({rows.length} {rows.length === 1 ? "row" : "rows"})
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportToPdf(config, rows)}>
          <FileText className="h-4 w-4 mr-2" />
          Export as PDF ({rows.length} {rows.length === 1 ? "row" : "rows"})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ExportMenu;
