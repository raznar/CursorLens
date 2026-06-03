import * as React from "react";

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Optional right-aligned slot (e.g. a sync badge or summary). */
  meta?: React.ReactNode;
}

/** Consistent page title block used at the top of every dashboard page. */
export function PageHeader({ title, description, meta }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {meta ? <div className="shrink-0">{meta}</div> : null}
    </div>
  );
}
