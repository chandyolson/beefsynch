import { ClipboardCopy } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ClickableRegNumberProps {
  registrationNumber: string | null | undefined;
  className?: string;
}

const ANGUS_URL = "https://www.angus.org/find-an-animal";

const ClickableRegNumber = ({ registrationNumber, className = "" }: ClickableRegNumberProps) => {
  if (!registrationNumber) return <span className="text-muted-foreground">—</span>;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(registrationNumber);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = registrationNumber;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    window.open(ANGUS_URL, "_blank", "noopener,noreferrer");
    toast({
      title: `Registration number ${registrationNumber} copied`,
      description: "Paste it into the search box on the Angus website.",
    });
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className={`inline-flex items-center gap-1 font-mono text-xs underline underline-offset-2 text-teal-400 hover:text-teal-300 transition-colors cursor-pointer ${className}`}
          >
            {registrationNumber}
            <ClipboardCopy className="h-3 w-3 shrink-0" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Copy {registrationNumber} and open Angus.org search</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ClickableRegNumber;
