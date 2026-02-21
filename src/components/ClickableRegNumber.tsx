import { useState } from "react";
import { ClipboardCopy, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ClickableRegNumberProps {
  registrationNumber: string | null | undefined;
  breed?: string | null;
  className?: string;
}

const BREED_LINKS: Record<string, { url: string; association: string }> = {
  Angus: {
    url: "https://www.angus.org/find-an-animal",
    association: "American Angus Association",
  },
  Hereford: {
    url: "https://myherd.org/web/USHF/AnimalSearch/List",
    association: "American Hereford Association",
  },
  Charolais: {
    url: "https://search.charolaisusa.com/Animal_Search.aspx",
    association: "American Charolais Association",
  },
  Simmental: {
    url: "https://herdbook.org/simmapp/template/animalSearch,AnimalSearch.vm",
    association: "American Simmental Association",
  },
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
};

const ClickableRegNumber = ({ registrationNumber, breed, className = "" }: ClickableRegNumberProps) => {
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (!registrationNumber) return <span className="text-muted-foreground">—</span>;

  const breedInfo = breed ? BREED_LINKS[breed] : undefined;
  const isKnownBreed = !!breedInfo;

  const handleKnownBreedClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!breedInfo) return;
    await copyToClipboard(registrationNumber);
    window.open(breedInfo.url, "_blank", "noopener,noreferrer");
    toast({
      title: `Registration number ${registrationNumber} copied`,
      description: `Paste it into the search box on the ${breedInfo.association} website.`,
    });
  };

  const handleSearchClick = (engine: "bing" | "ddg", e: React.MouseEvent) => {
    e.stopPropagation();
    const q = encodeURIComponent(registrationNumber);
    const url =
      engine === "bing"
        ? `https://www.bing.com/search?q=${q}`
        : `https://duckduckgo.com/?q=${q}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setPopoverOpen(false);
  };

  const tooltipText = isKnownBreed
    ? `Copy ${registrationNumber} and open ${breedInfo!.association} search`
    : `Search for ${registrationNumber}`;

  if (isKnownBreed) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleKnownBreedClick}
              className={`inline-flex items-center gap-1 font-mono text-xs underline underline-offset-2 text-teal-400 hover:text-teal-300 transition-colors cursor-pointer ${className}`}
            >
              {registrationNumber}
              <ClipboardCopy className="h-3 w-3 shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Unknown breed — show popover with search engines
  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className={`inline-flex items-center gap-1 font-mono text-xs underline underline-offset-2 text-teal-400 hover:text-teal-300 transition-colors cursor-pointer ${className}`}
              >
                {registrationNumber}
                <Search className="h-3 w-3 shrink-0" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-48 p-1" align="start">
        <button
          onClick={(e) => handleSearchClick("bing", e)}
          className="w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-accent transition-colors"
        >
          Search on Bing
        </button>
        <button
          onClick={(e) => handleSearchClick("ddg", e)}
          className="w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-accent transition-colors"
        >
          Search on DuckDuckGo
        </button>
      </PopoverContent>
    </Popover>
  );
};

export default ClickableRegNumber;
