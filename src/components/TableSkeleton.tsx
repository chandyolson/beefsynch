import React from "react";
import { cn } from "@/lib/utils";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

const TableSkeleton = ({ rows = 5, columns = 6, className }: TableSkeletonProps) => {
  return (
    <div className={cn("rounded-lg border border-border/50 overflow-hidden", className)}>
      <div className="divide-y divide-border/50">
        {/* Header row */}
        <div className="flex bg-muted/30 px-4 py-3 gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <div
              key={`header-${i}`}
              className="flex-1 h-4 bg-muted/50 rounded animate-pulse"
            />
          ))}
        </div>

        {/* Data rows */}
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={`row-${rowIdx}`} className="flex px-4 py-3 gap-4">
            {Array.from({ length: columns }).map((_, colIdx) => (
              <div
                key={`cell-${rowIdx}-${colIdx}`}
                className="flex-1 h-4 bg-muted/30 rounded animate-pulse"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TableSkeleton;
