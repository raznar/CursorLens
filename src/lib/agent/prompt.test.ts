import { describe, expect, it } from "vitest";
import { derivePageContext } from "./page-context";
import { buildSystemPrompt, readSchemaDoc, QUERY_RUNNER } from "./prompt";

describe("buildSystemPrompt", () => {
  it("inlines the generated schema doc read from data/SCHEMA.md", () => {
    const prompt = buildSystemPrompt();
    // The real, generated schema doc should be present...
    expect(prompt).toContain("# Database schema");
    // ...including tables the agent is told to prefer for per-user model questions.
    expect(prompt).toContain("usage_events");
    expect(prompt).toContain("by_user_models");
  });

  it("includes the query.mjs read-only querying guidance", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain(QUERY_RUNNER);
    expect(prompt).toContain(`node ${QUERY_RUNNER}`);
    expect(prompt).toContain("--json");
    // Steers the agent toward read-only SQL and the right tables/model matching.
    expect(prompt).toMatch(/SELECT/);
    expect(prompt.toLowerCase()).toContain("opus");
    expect(prompt.toLowerCase()).toContain("read-only");
  });

  it("uses injected schema markdown when provided (no disk read)", () => {
    const prompt = buildSystemPrompt({ schemaMarkdown: "## widgets\n\n| col | type |" });
    expect(prompt).toContain("## widgets");
    expect(prompt).toContain(QUERY_RUNNER);
  });

  it("degrades gracefully when the schema doc is missing", () => {
    const prompt = buildSystemPrompt({ cwd: "/definitely/not/a/real/path" });
    expect(prompt).toContain("schema doc unavailable");
    // Querying guidance is still present so the agent can introspect tables itself.
    expect(prompt).toContain(QUERY_RUNNER);
  });

  it("readSchemaDoc returns the on-disk schema and empty string on miss", () => {
    expect(readSchemaDoc()).toContain("# Database schema");
    expect(readSchemaDoc("/definitely/not/a/real/path")).toBe("");
  });

  it("inlines dashboard page context when provided", () => {
    const pageContext = derivePageContext({ pathname: "/models", range: "30d" });
    const prompt = buildSystemPrompt({ pageContext });
    expect(prompt).toContain("## Current dashboard context");
    expect(prompt).toContain("Models");
    expect(prompt).toContain("usage-events");
    expect(prompt).toContain("# Database schema");
  });

  it("omits page context section when not provided", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).not.toContain("## Current dashboard context");
  });
});
