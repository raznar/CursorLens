"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "./submit-button";

export type KeySource = "env" | "stored" | "none";

export interface KeyFormProps {
  title: string;
  description: string;
  configured: boolean;
  source: KeySource;
  placeholder: string;
  encryptionAvailable: boolean;
  /** Bound server action that stores the key from the `key` field. */
  saveAction: (formData: FormData) => Promise<void>;
  /** Bound server action that clears the stored key. */
  clearAction: () => Promise<void>;
}

/**
 * Enter / mask / clear one API key. The secret value is never sent to the client — only the
 * configured flag and source are. Env-provided keys are read-only here.
 */
export function KeyForm({
  title,
  description,
  configured,
  source,
  placeholder,
  encryptionAvailable,
  saveAction,
  clearAction,
}: KeyFormProps) {
  const statusBadge = configured ? (
    <Badge variant="success">
      {source === "env" ? "Configured (environment)" : "Configured (stored)"}
    </Badge>
  ) : (
    <Badge variant="secondary">Not configured</Badge>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {statusBadge}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {source === "env" ? (
          <p className="text-sm text-muted-foreground">
            This key is supplied by an environment variable and managed outside the app.
          </p>
        ) : (
          <>
            {!encryptionAvailable && (
              <p className="flex items-start gap-2 text-sm text-warning-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
                <span>
                  Set <code className="font-mono">CURSOR_LENS_SECRET</code> (e.g.{" "}
                  <code className="font-mono">openssl rand -hex 32</code>) to store keys encrypted
                  at rest.
                </span>
              </p>
            )}
            <form action={saveAction} className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="password"
                name="key"
                autoComplete="off"
                placeholder={configured ? "•••••••••• (enter a new value to replace)" : placeholder}
                disabled={!encryptionAvailable}
                aria-label={title}
              />
              <SubmitButton disabled={!encryptionAvailable} pendingLabel="Saving…">
                Save
              </SubmitButton>
            </form>
            {configured && source === "stored" && (
              <form action={clearAction}>
                <SubmitButton variant="outline" size="sm" pendingLabel="Clearing…">
                  Clear stored key
                </SubmitButton>
              </form>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
