import React from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon | React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const EmptyState = ({ icon: Icon, title, description, action }: EmptyStateProps) => {
  // Lucide icons are created with React.forwardRef which returns an object
  // (not a function), so we need to detect both shapes.
  const isIconComponent =
    Icon != null &&
    (typeof Icon === "function" ||
      (typeof Icon === "object" && "$$typeof" in (Icon as object)));

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon && (
        <div className="mb-4 text-muted-foreground">
          {isIconComponent ? (
            // Render Lucide icon component with JSX - type assertion needed for TS
            (Icon as any)({ className: "h-12 w-12 mx-auto opacity-50" })
          ) : (
            Icon
          )}
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} variant="outline" className="gap-2">
          {action.label}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;
