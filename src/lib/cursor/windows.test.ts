import { describe, expect, it } from "vitest";
import { chunkWindows, endOfUtcDay, MAX_WINDOW_DAYS, startOfUtcDay } from "./windows";

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
      const spanMs = w.end.getTime() - w.start.getTime() + 1;
      expect(spanMs).toBeLessThanOrEqual(MAX_WINDOW_DAYS * DAY);
    }
    // Contiguous at ms precision: no instant is skipped between windows.
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].start.getTime()).toBe(windows[i - 1].end.getTime() + 1);
    }
    expect(windows[0].start).toEqual(start);
    expect(windows.at(-1)!.end.getTime()).toBe(end.getTime());
  });

  it("ends every non-final window at the last millisecond of a UTC day", () => {
    const start = new Date("2025-03-05T13:45:00Z");
    const end = new Date(start.getTime() + 100 * DAY);
    const windows = chunkWindows(start, end);
    expect(windows[0].start.toISOString()).toBe("2025-03-05T00:00:00.000Z");
    for (const w of windows.slice(0, -1)) {
      expect(w.end.toISOString().endsWith("T23:59:59.999Z")).toBe(true);
      // Exactly 30 calendar days per full window.
      expect(w.end.getTime() - w.start.getTime() + 1).toBe(MAX_WINDOW_DAYS * DAY);
    }
  });

  it("covers every calendar day exactly once across a long range", () => {
    const start = new Date("2025-01-01T00:00:00Z");
    const end = new Date("2025-12-31T23:59:59.999Z");
    const windows = chunkWindows(start, end);
    const days = new Set<string>();
    for (const w of windows) {
      for (let t = w.start.getTime(); t <= w.end.getTime(); t += DAY) {
        days.add(new Date(t).toISOString().slice(0, 10));
      }
    }
    expect(days.size).toBe(365);
  });

  it("returns no windows for an inverted range", () => {
    expect(chunkWindows(new Date("2025-02-01"), new Date("2025-01-01"))).toEqual([]);
  });
});

describe("UTC day helpers", () => {
  it("floors and ceils to the containing UTC day", () => {
    const ms = Date.parse("2025-06-15T17:22:03.456Z");
    expect(new Date(startOfUtcDay(ms)).toISOString()).toBe("2025-06-15T00:00:00.000Z");
    expect(new Date(endOfUtcDay(ms)).toISOString()).toBe("2025-06-15T23:59:59.999Z");
  });
});
