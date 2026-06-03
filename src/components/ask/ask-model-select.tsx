"use client";

import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentModelOption } from "@/lib/agent/types";

export interface AskModelSelectProps {
  models: AgentModelOption[];
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  compact?: boolean;
}

export function AskModelSelect({
  models,
  value,
  onChange,
  loading = false,
  error = null,
  disabled = false,
  compact = false,
}: AskModelSelectProps) {
  const selected = models.find((model) => model.id === value);

  return (
    <div className={compact ? "space-y-1" : "flex items-center gap-2"}>
      <Label
        htmlFor={compact ? "ask-agent-model-panel" : "ask-agent-model"}
        className={
          compact ? "text-[10px] uppercase tracking-wide text-muted-foreground" : "text-xs"
        }
      >
        Model
      </Label>
      <div className="min-w-0 flex-1">
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger
            id={compact ? "ask-agent-model-panel" : "ask-agent-model"}
            className={compact ? "h-8 bg-background text-xs" : "h-9 min-w-48 bg-background"}
            aria-label="Choose Ask Agent model"
          >
            <SelectValue placeholder={loading ? "Loading models..." : "Choose model"} />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading ? (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading models...
          </p>
        ) : error ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{error}</p>
        ) : selected?.description ? (
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{selected.description}</p>
        ) : null}
      </div>
    </div>
  );
}
