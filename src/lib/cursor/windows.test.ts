import { describe, expect, it } from "vitest";
import { chunkWindows, MAX_WINDOW_DAYS } from "./windows";

const DAY = 24 * 60 * 60 * 1000;

describe("chunkWindows", () => {
  it("returns a single window for ranges within the 30-day cap", () => {
    const start = new Date("2025-01-01T00:00:00Z");
    const end = new Date("2025-01-08T00:00:00Z");
    const windows = chunkWindows(start, end);
    expect(windows).toHaveLength(1);
    expect(windows[0].start).toEqual(start);
    expect(windows[0].end).toEqual(end);
  });

  it("splits longer ranges into contiguous ≤30-day windows covering the whole span", () => {
    const start = new Date("2025-01-01T00:00:00Z");
    const end = new Date(start.getTime() + 70 * DAY);
    const windows = chunkWindows(start, end);

    expect(windows.length).toBeGreaterThanOrEqual(3);
    for (const w of windows) {
      const spanDays = (w.end.getTime() - w.start.getTime()) / DAY;
      expect(spanDays).toBeLessThanOrEqual(MAX_WINDOW_DAYS - 1);
    }
    // Contiguous, no gaps or overlaps (next starts one day after prev ends).
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].start.getTime()).toBe(windows[i - 1].end.getTime() + DAY);
    }
    expect(windows[0].start).toEqual(start);
    expect(windows.at(-1)!.end.getTime()).toBe(end.getTime());
  });

  it("returns no windows for an inverted range", () => {
    expect(chunkWindows(new Date("2025-02-01"), new Date("2025-01-01"))).toEqual([]);
  });
});
