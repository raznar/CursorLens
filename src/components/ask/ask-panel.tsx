"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Bookmark,
  ChevronRight,
  MessageSquare,
  Send,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DEFAULT_RANGE } from "@/lib/date-range";
import { getPageDef } from "@/lib/dashboard-pages";
import type { SavedReport } from "@/db/schema";
import { EXAMPLE_PROMPTS, deriveConversationName } from "./ask-constants";
import { AskMessageBubble } from "./ask-message";
import { AskModelSelect } from "./ask-model-select";
import { SaveConversationDialog } from "./save-report-dialog";
import { useAskChat } from "./use-ask-chat";

/** Expanded panel width — in-flow flex sibling so main content shifts rather than clips. */
const PANEL_WIDTH_CLASS = "w-full max-w-sm sm:w-96";

export interface AskAgentPanelProps {
  initialReports: SavedReport[];
  keyConfigured: boolean;
}

export function AskAgentPanel({ initialReports, keyConfigured }: AskAgentPanelProps) {
  const [open, setOpen] = React.useState(false);
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
  const pageDef = getPageDef(pathname);

  React.useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void chat.send(chat.input);
  }

  const canClearConversation = chat.messages.length > 0 || chat.input.trim().length > 0;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-md border border-r-0 bg-card px-2 py-3 shadow-md transition-colors hover:bg-accent"
          aria-label="Open Ask Agent"
          title="Ask Agent"
        >
          <MessageSquare className="h-5 w-5 text-primary" />
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
            Ask
          </span>
        </button>
      ) : (
        <aside
          className={`flex h-full max-h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-border bg-card shadow-[inset_1px_0_0_0_hsl(var(--accent)/0.08)] transition-[width] duration-200 ease-in-out ${PANEL_WIDTH_CLASS}`}
          aria-label="Ask Agent panel"
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/50 px-3 py-2.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setOpen(false)}
              aria-label="Collapse Ask Agent"
              title="Collapse"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                Ask Agent
              </p>
              {pageDef ? (
                <p className="truncate text-xs text-muted-foreground">Viewing {pageDef.label}</p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={chat.clearConversation}
              disabled={!canClearConversation}
              aria-label="Clear current conversation"
              title="Clear conversation"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </header>

          {!keyConfigured ? (
            <div className="flex shrink-0 items-start gap-2 border-b bg-warning/10 px-3 py-2 text-xs">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <p className="text-muted-foreground">
                {"Add "}
                <code className="rounded bg-muted px-1 font-mono">CURSOR_API_KEY</code>
                {" in "}
                <Link href="/settings" className="font-medium text-foreground underline">
                  Settings
                </Link>
                .
              </p>
            </div>
          ) : null}

          <ScrollArea type="hover" className="min-h-0 flex-1">
            <div className="min-w-0 space-y-3 p-3">
              {chat.messages.length === 0 ? (
                <div className="space-y-3">
                  <EmptyState
                    icon={<Sparkles className="h-6 w-6" />}
                    title="Ask about your data"
                    description="Read-only SQL over your local analytics cache."
                  />
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Examples
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {EXAMPLE_PROMPTS.map((example) => (
                        <button
                          key={example}
                          type="button"
                          onClick={() => void chat.send(example)}
                          className="rounded-md border bg-background px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent"
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

          <section
            className="shrink-0 border-t border-border bg-muted/30 px-3 py-2"
            aria-labelledby="ask-saved-conversations-heading"
          >
            <div
              id="ask-saved-conversations-heading"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-medium"
            >
              <Bookmark className="h-3.5 w-3.5" />
              Saved conversations
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {chat.reports.length}
              </Badge>
            </div>
            {chat.reports.length === 0 ? (
              <p className="rounded-md border border-dashed bg-background/50 p-2 text-xs text-muted-foreground">
                Save an agent answer to view the conversation here later.
              </p>
            ) : (
              <ul className="max-h-36 space-y-1 overflow-y-auto">
                {chat.reports.map((report) => (
                  <li
                    key={report.id}
                    className="group flex items-start gap-1 rounded-md border p-1.5 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => chat.handleOpenReport(report)}
                      disabled={chat.isStreaming}
                      className="min-w-0 flex-1 text-left disabled:opacity-50"
                      title="Open saved conversation"
                    >
                      <span className="flex items-center gap-1 font-medium">
                        <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{report.name}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-muted-foreground">
                        {report.prompt}
                      </span>
                      <span className="mt-0.5 block truncate text-muted-foreground/80">
                        {report.response || "No saved response captured."}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={() => chat.handleDeleteReport(report.id)}
                      aria-label={`Delete ${report.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="shrink-0 border-t border-border bg-muted/30 px-3 py-2">
            <AskModelSelect
              compact
              models={chat.modelOptions}
              value={chat.selectedModelId}
              onChange={chat.setSelectedModelId}
              loading={chat.modelsLoading}
              error={chat.modelsError}
              disabled={chat.isStreaming || !keyConfigured}
            />
          </section>

          <form
            onSubmit={handleSubmit}
            className="flex shrink-0 items-center gap-2 border-t border-border bg-muted/40 p-2.5"
          >
            <Input
              value={chat.input}
              onChange={(e) => chat.setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={chat.isStreaming}
              className="h-9 text-sm"
              aria-label="Ask the agent a question"
            />
            {chat.isStreaming ? (
              <Button type="button" variant="outline" size="icon" onClick={chat.stop} title="Stop">
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!chat.input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            )}
          </form>
        </aside>
      )}

      {chat.saveTarget ? (
        <SaveConversationDialog
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) chat.setSaveTarget(null);
          }}
          prompt={chat.saveTarget.prompt}
          response={chat.saveTarget.response}
          defaultName={chat.saveTarget.defaultName}
          onSaved={chat.handleSaved}
        />
      ) : null}
    </>
  );
}
