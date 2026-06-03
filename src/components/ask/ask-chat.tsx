"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bookmark, Send, Sparkles, Square, Trash2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DEFAULT_RANGE } from "@/lib/date-range";
import type { SavedReport } from "@/db/schema";
import { EXAMPLE_PROMPTS, deriveConversationName } from "./ask-constants";
import { AskMessageBubble } from "./ask-message";
import { AskModelSelect } from "./ask-model-select";
import { SaveConversationDialog } from "./save-report-dialog";
import { useAskChat } from "./use-ask-chat";

export interface AskChatProps {
  initialReports: SavedReport[];
  keyConfigured: boolean;
}

/** Full-page chat layout (legacy); global panel is the primary surface. */
export function AskChat({ initialReports, keyConfigured }: AskChatProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollEndRef = React.useRef<HTMLDivElement | null>(null);

  const getPage = React.useCallback(
    () => ({
      pathname,
      range: searchParams.get("range") ?? DEFAULT_RANGE,
    }),
    [pathname, searchParams],
  );

  const chat = useAskChat({ initialReports, getPage, modelsEnabled: keyConfigured });

  React.useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void chat.send(chat.input);
  }

  const canClearConversation = chat.messages.length > 0 || chat.input.trim().length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="flex h-[calc(100vh-12rem)] min-h-[32rem] flex-col">
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <CardTitle className="flex flex-1 items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Ask Agent
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={chat.clearConversation}
              disabled={!canClearConversation}
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardHeader>

        {!keyConfigured ? (
          <div className="flex items-start gap-2 border-b bg-warning/10 px-6 py-3 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-muted-foreground">
              {"No Cursor API key is configured. Add a "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">CURSOR_API_KEY</code>
              {" (a personal or service-account key — not a team Admin API key) in "}
              <Link href="/settings" className="font-medium text-foreground underline">
                Settings
              </Link>
              {" to enable the Ask Agent."}
            </p>
          </div>
        ) : null}

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4 sm:p-6">
            {chat.messages.length === 0 ? (
              <div className="space-y-4">
                <EmptyState
                  icon={<Sparkles className="h-8 w-8" />}
                  title="Ask anything about your Cursor data"
                  description={
                    "The agent answers by running read-only SQL against your local analytics database."
                  }
                />
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Try an example
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLE_PROMPTS.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => void chat.send(example)}
                        className="rounded-full border bg-background px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              chat.messages.map((message) => (
                <AskMessageBubble
                  key={message.id}
                  message={message}
                  onSave={() =>
                    chat.setSaveTarget({
                      prompt: message.prompt ?? "",
                      response: message.content,
                      defaultName: deriveConversationName(message.prompt ?? ""),
                    })
                  }
                />
              ))
            )}
            <div ref={scrollEndRef} />
          </div>
        </ScrollArea>

        <div className="border-t bg-muted/30 p-3">
          <AskModelSelect
            models={chat.modelOptions}
            value={chat.selectedModelId}
            onChange={chat.setSelectedModelId}
            loading={chat.modelsLoading}
            error={chat.modelsError}
            disabled={chat.isStreaming || !keyConfigured}
          />
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t p-3">
          <Input
            value={chat.input}
            onChange={(e) => chat.setInput(e.target.value)}
            placeholder="Ask a question about your Cursor usage…"
            disabled={chat.isStreaming}
            aria-label="Ask the agent a question"
          />
          {chat.isStreaming ? (
            <Button type="button" variant="outline" onClick={chat.stop} title="Stop">
              <Square className="h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!chat.input.trim()}>
              <Send className="h-4 w-4" />
              Send
            </Button>
          )}
        </form>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bookmark className="h-4 w-4" />
            Saved conversations
            {chat.reports.length > 0 ? (
              <Badge variant="secondary" className="ml-auto">
                {chat.reports.length}
              </Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chat.reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {"Save an agent answer to view the conversation here later."}
            </p>
          ) : (
            <ul className="space-y-2">
              {chat.reports.map((report) => (
                <li
                  key={report.id}
                  className="group flex items-start gap-2 rounded-md border p-2 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => chat.handleOpenReport(report)}
                    disabled={chat.isStreaming}
                    className="min-w-0 flex-1 text-left disabled:opacity-50"
                    title="Open saved conversation"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <Bookmark className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{report.name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {report.prompt}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground/80">
                      {report.response || "No saved response captured."}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    onClick={() => chat.handleDeleteReport(report.id)}
                    title="Delete report"
                    aria-label={`Delete ${report.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {chat.saveTarget ? (
        <SaveConversationDialog
          open
          onOpenChange={(open) => {
            if (!open) chat.setSaveTarget(null);
          }}
          prompt={chat.saveTarget.prompt}
          response={chat.saveTarget.response}
          defaultName={chat.saveTarget.defaultName}
          onSaved={chat.handleSaved}
        />
      ) : null}
    </div>
  );
}
