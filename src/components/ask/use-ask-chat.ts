"use client";

import * as React from "react";
import {
  DEFAULT_AGENT_MODEL_ID,
  type AgentModelOption,
  type AgentStreamEvent,
  type ChatMessage,
  type ChatPageInput,
} from "@/lib/agent/types";
import type { SavedReport } from "@/db/schema";

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** For assistant messages: the question that produced it (used by "Save conversation"). */
  prompt?: string;
  /** Transient tool-activity line shown while the agent works. */
  status?: string | null;
  error?: string | null;
  errorCode?: string;
  streaming?: boolean;
}

let counter = 0;
function uid(): string {
  counter += 1;
  return `m${Date.now().toString(36)}-${counter}`;
}

export interface UseAskChatOptions {
  initialReports: SavedReport[];
  /** Current page hint sent with each chat request (pathname + range). */
  getPage?: () => ChatPageInput | undefined;
  /** Fetch model choices only when the SDK key is configured. */
  modelsEnabled?: boolean;
}

export function useAskChat({ initialReports, getPage, modelsEnabled = true }: UseAskChatOptions) {
  const [messages, setMessages] = React.useState<UiMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [modelOptions, setModelOptions] = React.useState<AgentModelOption[]>([
    {
      id: DEFAULT_AGENT_MODEL_ID,
      displayName: "Auto",
      description: "Let Cursor choose the best model for this question.",
    },
  ]);
  const [selectedModelId, setSelectedModelId] = React.useState(DEFAULT_AGENT_MODEL_ID);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [modelsError, setModelsError] = React.useState<string | null>(null);
  const [reports, setReports] = React.useState<SavedReport[]>(initialReports);
  const [saveTarget, setSaveTarget] = React.useState<{
    prompt: string;
    response: string;
    defaultName: string;
  } | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);

  const updateMessage = React.useCallback((id: string, patch: (m: UiMessage) => UiMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? patch(m) : m)));
  }, []);

  React.useEffect(() => {
    if (!modelsEnabled) return;

    let ignore = false;
    async function loadModels() {
      setModelsLoading(true);
      setModelsError(null);
      try {
        const res = await fetch("/api/chat/models", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          models?: AgentModelOption[];
          error?: string;
        };
        if (ignore) return;
        if (!res.ok || !Array.isArray(data.models)) {
          setModelsError(data.error ?? "Could not load Cursor models.");
          return;
        }

        setModelOptions(data.models);
        setSelectedModelId((current) =>
          data.models?.some((model) => model.id === current) ? current : DEFAULT_AGENT_MODEL_ID,
        );
      } catch {
        if (!ignore) setModelsError("Could not load Cursor models.");
      } finally {
        if (!ignore) setModelsLoading(false);
      }
    }

    void loadModels();
    return () => {
      ignore = true;
    };
  }, [modelsEnabled]);

  const applyEvent = React.useCallback(
    (id: string, event: AgentStreamEvent) => {
      updateMessage(id, (m) => {
        switch (event.type) {
          case "text":
            return { ...m, content: m.content + event.value, status: null };
          case "status":
            return { ...m, status: event.value };
          case "error":
            return { ...m, error: event.value, errorCode: event.code, status: null };
          case "done":
            return { ...m, streaming: false, status: null };
          default:
            return m;
        }
      });
    },
    [updateMessage],
  );

  const send = React.useCallback(
    async (promptText: string) => {
      const text = promptText.trim();
      if (!text || isStreaming) return;

      const history: ChatMessage[] = messages
        .filter((m) => !m.error && m.content && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ role: m.role, content: m.content }));

      const assistantId = uid();
      setInput("");
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "user", content: text },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          prompt: text,
          streaming: true,
          status: null,
          error: null,
        },
      ]);
      setIsStreaming(true);

      const page = getPage?.();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: text,
            modelId: selectedModelId,
            history,
            ...(page ? { page } : {}),
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            code?: string;
          };
          updateMessage(assistantId, (m) => ({
            ...m,
            streaming: false,
            error: data.error ?? "The request failed.",
            errorCode: data.code,
          }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf("\n");
          while (newline >= 0) {
            const lineStr = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
            if (!lineStr) continue;
            try {
              applyEvent(assistantId, JSON.parse(lineStr) as AgentStreamEvent);
            } catch {
              // ignore a malformed line rather than aborting the stream
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          updateMessage(assistantId, (m) => ({
            ...m,
            streaming: false,
            status: null,
            content: m.content || "Stopped.",
          }));
        } else {
          updateMessage(assistantId, (m) => ({
            ...m,
            streaming: false,
            status: null,
            error: "The connection was lost. Please try again.",
          }));
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        updateMessage(assistantId, (m) => (m.streaming ? { ...m, streaming: false } : m));
      }
    },
    [isStreaming, messages, applyEvent, updateMessage, getPage, selectedModelId],
  );

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearConversation = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setInput("");
    setIsStreaming(false);
    setSaveTarget(null);
  }, []);

  const handleDeleteReport = React.useCallback((id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
    void fetch(`/api/reports/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const handleOpenReport = React.useCallback(
    (report: SavedReport) => {
      if (isStreaming) return;
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "user", content: report.prompt },
        {
          id: uid(),
          role: "assistant",
          content: report.response || "No saved response was captured for this conversation.",
          prompt: report.prompt,
          streaming: false,
          status: null,
          error: null,
        },
      ]);
      setInput("");
    },
    [isStreaming],
  );

  const handleSaved = React.useCallback((report: SavedReport) => {
    setReports((prev) => [report, ...prev.filter((r) => r.id !== report.id)]);
  }, []);

  return {
    messages,
    input,
    setInput,
    isStreaming,
    modelOptions,
    selectedModelId,
    setSelectedModelId,
    modelsLoading,
    modelsError,
    reports,
    saveTarget,
    setSaveTarget,
    send,
    stop,
    clearConversation,
    handleOpenReport,
    handleDeleteReport,
    handleSaved,
  };
}
