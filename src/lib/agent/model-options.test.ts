import { describe, expect, it } from "vitest";
import { DEFAULT_AGENT_MODEL_ID } from "./types";
import { normalizeAgentModelOptions } from "./model-options";

describe("normalizeAgentModelOptions", () => {
  it("always includes Auto first", () => {
    expect(normalizeAgentModelOptions([])[0]).toMatchObject({
      id: DEFAULT_AGENT_MODEL_ID,
      displayName: "Auto",
    });
  });

  it("uses SDK display names and skips empty or duplicate ids", () => {
    const options = normalizeAgentModelOptions([
      { id: "claude-opus-4.5", displayName: "Claude Opus 4.5" },
      { id: " ", displayName: "Missing" },
      { id: "claude-opus-4.5", displayName: "Duplicate" },
      { id: "gpt-5" },
    ]);

    expect(options).toEqual([
      expect.objectContaining({ id: DEFAULT_AGENT_MODEL_ID, displayName: "Auto" }),
      { id: "claude-opus-4.5", displayName: "Claude Opus 4.5" },
      { id: "gpt-5", displayName: "gpt-5" },
    ]);
  });
});
