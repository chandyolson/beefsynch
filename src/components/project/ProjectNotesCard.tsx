import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProjectNotesCardProps {
  notes: string | null;
}

export default function ProjectNotesCard({ notes }: ProjectNotesCardProps) {
  if (!notes) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Notes</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-foreground whitespace-pre-wrap">{notes}</p>
      </CardContent>
    </Card>
  );
}
