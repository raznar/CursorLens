"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SavedReport } from "@/db/schema";

export interface SaveConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** User prompt to persist with the saved conversation. */
  prompt: string;
  /** Assistant response to persist with the saved conversation. */
  response: string;
  /** Suggested name (editable). */
  defaultName: string;
  onSaved: (report: SavedReport) => void;
}

/** Dialog that persists the current prompt/response pair as a saved conversation. */
export function SaveConversationDialog({
  open,
  onOpenChange,
  prompt,
  response,
  defaultName,
  onSaved,
}: SaveConversationDialogProps) {
  // The parent mounts this component fresh each time it opens (keyed render), so
  // initializing from props here is correct and avoids resetting state in an effect.
  const [name, setName] = React.useState(defaultName);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the conversation a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, prompt, response }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        report?: SavedReport;
        error?: string;
      };
      if (!res.ok || !data.report) {
        setError(data.error ?? "Could not save the conversation.");
        return;
      }
      onSaved(data.report);
      onOpenChange(false);
    } catch {
      setError("Could not save the conversation. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save conversation</DialogTitle>
          <DialogDescription>
            {"Save this prompt and response so you can view the answer again later."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="conversation-name">Conversation name</Label>
            <Input
              id="conversation-name"
              value={name}
              autoFocus
              placeholder="e.g. Opus users (90 days)"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Prompt</Label>
            <p className="max-h-32 overflow-y-auto rounded-md border bg-muted/40 p-2 text-sm text-muted-foreground">
              {prompt}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Agent response</Label>
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-sm text-muted-foreground">
              {response}
            </p>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save conversation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
