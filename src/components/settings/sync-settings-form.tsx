"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "./submit-button";

export interface SyncSettingsFormProps {
  intervalHours: number;
  backfillDays: number;
  saveAction: (formData: FormData) => Promise<void>;
}

/** Configure the hourly-cron interval and the default backfill window. */
export function SyncSettingsForm({
  intervalHours,
  backfillDays,
  saveAction,
}: SyncSettingsFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sync schedule</CardTitle>
        <CardDescription>
          How often the background sync runs, and how many days a backfill pulls.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={saveAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="intervalHours">Interval (hours)</Label>
              <Input
                id="intervalHours"
                name="intervalHours"
                type="number"
                min={1}
                max={24}
                defaultValue={intervalHours}
              />
              <p className="text-xs text-muted-foreground">Between 1 and 24 hours.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="backfillDays">Backfill window (days)</Label>
              <Input
                id="backfillDays"
                name="backfillDays"
                type="number"
                min={1}
                max={365}
                defaultValue={backfillDays}
              />
              <p className="text-xs text-muted-foreground">Chunked into ≤ 30-day requests.</p>
            </div>
          </div>
          <div>
            <SubmitButton pendingLabel="Saving…">Save schedule</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
