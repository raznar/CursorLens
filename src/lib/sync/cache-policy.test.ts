import { describe, expect, it } from "vitest";
import { hourlyPollWindowActive } from "./cache-policy";

describe("hourlyPollWindowActive", () => {
  const now = 1_700_000_000_000;

  it("returns false when there is no prior ok sync", () => {
    expect(hourlyPollWindowActive(null, now)).toBe(false);
  });

  it("returns true when the last ok sync was less than an hour ago", () => {
    expect(hourlyPollWindowActive(now - 30 * 60 * 1000, now)).toBe(true);
  });

  it("returns false when the last ok sync was at least an hour ago", () => {
    expect(hourlyPollWindowActive(now - 61 * 60 * 1000, now)).toBe(false);
  });
});
