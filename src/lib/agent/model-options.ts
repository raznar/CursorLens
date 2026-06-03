import type { AgentModelOption } from "./types";
import { DEFAULT_AGENT_MODEL_ID } from "./types";

type RawModel = {
  id?: string | null;
  displayName?: string | null;
  description?: string | null;
};

const AUTO_MODEL_OPTION: AgentModelOption = {
  id: DEFAULT_AGENT_MODEL_ID,
  displayName: "Auto",
  description: "Let Cursor choose the best model for this question.",
};

/** Normalize SDK model-list entries into stable UI options, always including Auto first. */
export function normalizeAgentModelOptions(models: RawModel[]): AgentModelOption[] {
  const seen = new Set<string>([AUTO_MODEL_OPTION.id]);
  const options = [AUTO_MODEL_OPTION];

  for (const model of models) {
    const id = model.id?.trim();
    if (!id || seen.has(id)) continue;

    seen.add(id);
    const displayName = model.displayName?.trim() || id;
    const description = model.description?.trim();
    options.push({
      id,
      displayName,
      ...(description ? { description } : {}),
    });
  }

  return options;
}
