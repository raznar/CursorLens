"use client";

import Link from "next/link";
import { Bookmark, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "./markdown";
import type { UiMessage } from "./use-ask-chat";

export function AskMessageBubble({ message, onSave }: { message: UiMessage; onSave: () => void }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  const isThinking = message.streaming && !message.content && !message.error;
  const canSave =
    !message.streaming &&
    !message.error &&
    Boolean(message.prompt) &&
    Boolean(message.content.trim());

  return (
    <div className="flex flex-col gap-1.5">
      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl rounded-bl-sm border bg-card px-3 py-2.5">
        {message.error ? (
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-destructive">
              <TriangleAlert className="h-4 w-4" />
              {message.errorCode === "no_key" ? "API key needed" : "Could not get an answer"}
            </p>
            <p className="text-muted-foreground">{message.error}</p>
            {message.errorCode === "no_key" ? (
              <Link href="/settings" className="text-sm font-medium underline">
                Open Settings
              </Link>
            ) : null}
          </div>
        ) : isThinking ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {message.status ?? "Thinking…"}
          </p>
        ) : (
          <>
            <Markdown content={message.content} />
            {message.streaming && message.status ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {message.status}
              </p>
            ) : null}
          </>
        )}
      </div>
      {canSave ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={onSave}
          >
            <Bookmark className="h-3.5 w-3.5" />
            Save conversation
          </Button>
        </div>
      ) : null}
    </div>
  );
}
