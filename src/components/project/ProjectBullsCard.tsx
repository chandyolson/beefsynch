import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Star, ExternalLink } from "lucide-react";
import ClickableRegNumber from "@/components/ClickableRegNumber";

interface Bull {
  id: string;
  units: number;
  custom_bull_name: string | null;
  bull_catalog_id: string | null;
  bulls_catalog: {
    bull_name: string;
    company: string;
    registration_number: string;
    breed: string;
  } | null;
}

interface ProjectBullsCardProps {
  bulls: Bull[];
  favoritedIds: Set<string>;
  onToggleFavorite: (bullId: string, e: React.MouseEvent) => void;
}

export default function ProjectBullsCard({
  bulls,
  favoritedIds,
  onToggleFavorite,
}: ProjectBullsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Bulls & Semen</CardTitle>
      </CardHeader>
      <CardContent>
        {bulls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bulls assigned.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Bull Name</TableHead>
                <TableHead className="text-right">Units</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bulls.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="w-8">
                    {b.bull_catalog_id && (
                      <button onClick={(e) => onToggleFavorite(b.bull_catalog_id!, e)}>
                        <Star
                          className={`h-4 w-4 transition-colors ${
                            favoritedIds.has(b.bull_catalog_id!)
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground hover:text-yellow-400"
                          }`}
                        />
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {b.bulls_catalog
                      ? (() => {
                          const isSelectSires = (b.bulls_catalog?.company || "")
                            .toLowerCase()
                            .includes("select sires");
                          const bullDisplay = `${b.bulls_catalog!.bull_name} (${b.bulls_catalog?.company || "Custom"})`;
                          if (isSelectSires) {
                            const breedSlug = (b.bulls_catalog?.breed || "")
                              .toLowerCase()
                              .replace(/\s+/g, "-");
                            const nameSlug = b.bulls_catalog!.bull_name
                              .toLowerCase()
                              .replace(/\s+/g, "-");
                            const url = `https://selectsiresbeef.com/bull/${breedSlug}/${nameSlug}/`;
                            return (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {bullDisplay}
                                <ExternalLink className="inline h-3 w-3 ml-1 -mt-0.5" />
                              </a>
                            );
                          }
                          return bullDisplay;
                        })()
                      : b.custom_bull_name ?? "Unknown"}
                    {b.bulls_catalog?.registration_number && (
                      <div className="mt-0.5">
                        <ClickableRegNumber
                          registrationNumber={b.bulls_catalog.registration_number}
                          breed={b.bulls_catalog.breed}
                        />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{b.units}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
