import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn } from "@/lib/utils";

export interface ChartCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** When true, render an EmptyState instead of children. */
  isEmpty?: boolean;
  emptyMessage?: string;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

/** Card shell for a titled chart or table, with a built-in empty state. */
export function ChartCard({
  title,
  description,
  action,
  isEmpty,
  emptyMessage,
  children,
  className,
  contentClassName,
}: ChartCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent className={cn(contentClassName)}>
        {isEmpty ? (
          <EmptyState description={emptyMessage ?? "Run a sync to populate this chart."} />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
