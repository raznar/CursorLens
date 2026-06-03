/** Example questions, including the required Opus-90-day prompt. */
export const EXAMPLE_PROMPTS = [
  "Give me all users who used Opus in the past 90 days",
  "Who are the top 10 spenders this month?",
  "Which teams or users have adopted MCP?",
  "Show daily active users for the last 30 days",
  "What is the model usage breakdown by requests?",
] as const;

export function deriveConversationName(prompt: string): string {
  const clean = prompt.trim().replace(/\s+/g, " ");
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
}
