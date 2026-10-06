import { describe, expect, it } from "vitest";
import { coverageBounds, coveredDayKeys, dayKey, etagForWindow, planWindows } from "./plan";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-03-20T15:30:00.000Z");
const day = (key: string) => Date.parse(`${key}T00:00:00.000Z`);
const range = (startKey: string, end = now) => ({
  start: new Date(day(startKey)),
  end: new Date(end),
});

describe("planWindows", () => {
  it("returns the full chunked range when nothing is covered", () => {
    const windows = planWindows({ range: range("2026-01-01"), now, refreshDays: 7, covered: [] });
    expect(windows.length).toBe(3);
    expect(dayKey(windows[0]!.start.getTime())).toBe("2026-01-01");
    expect(windows.at(-1)!.end.getTime()).toBe(now);
  });

  it("ignores coverage when forced", () => {
    const covered = [{ window_start: "2026-01-01", window_end: "2026-03-19" }];
    const windows = planWindows({
      range: range("2026-01-01"),
      now,
      refreshDays: 7,
      covered,
      force: true,
    });
    expect(windows.length).toBe(3);
    expect(dayKey(windows[0]!.start.getTime())).toBe("2026-01-01");
  });

  it("skips covered days but always refreshes the trailing window", () => {
    const covered = [{ window_start: "2026-01-01", window_end: "2026-03-19" }];
    const windows = planWindows({ range: range("2026-01-01"), now, refreshDays: 7, covered });
    expect(windows).toHaveLength(1);
    expect(dayKey(windows[0]!.start.getTime())).toBe("2026-03-13");
    expect(windows[0]!.end.getTime()).toBe(now);
  });

  it("fetches each uncovered gap as its own contiguous run of days", () => {
    const covered = [
      { window_start: "2026-01-01", window_end: "2026-01-20" },
      { window_start: "2026-02-01", window_end: "2026-02-10" },
      { window_start: "2026-02-20", window_end: "2026-03-19" },
    ];
    const windows = planWindows({ range: range("2026-01-01"), now, refreshDays: 7, covered });
    const spans = windows.map((w) => [dayKey(w.start.getTime()), dayKey(w.end.getTime())]);
    expect(spans).toEqual([
      ["2026-01-21", "2026-01-31"],
      ["2026-02-11", "2026-02-19"],
      ["2026-03-13", "2026-03-20"],
    ]);
    // Gap windows end at the last millisecond of their final day.
    expect(windows[0]!.end.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });

  it("re-chunks a long uncovered run into ≤30-day windows", () => {
    const covered = [{ window_start: "2026-03-01", window_end: "2026-03-19" }];
    const windows = planWindows({ range: range("2025-12-01"), now, refreshDays: 7, covered });
    const first = windows.filter((w) => w.end.getTime() < day("2026-03-01"));
    expect(first.length).toBe(3);
    for (const w of first)
      expect(w.end.getTime() - w.start.getTime() + 1).toBeLessThanOrEqual(30 * DAY);
  });

  it("returns nothing for an inverted range", () => {
    expect(
      planWindows({
        range: { start: new Date(now), end: new Date(now - DAY) },
        now,
        refreshDays: 7,
        covered: [],
      }),
    ).toEqual([]);
  });
});

describe("coverageBounds", () => {
  it("records complete days only, never the current UTC day", () => {
    const window = { start: new Date(day("2026-03-10")), end: new Date(now) };
    expect(coverageBounds(window, now)).toEqual({
      window_start: "2026-03-10",
      window_end: "2026-03-19",
    });
  });

  it("returns null for a window entirely inside today", () => {
    const window = { start: new Date(day("2026-03-20")), end: new Date(now) };
    expect(coverageBounds(window, now)).toBeNull();
  });

  it("keeps historical windows intact", () => {
    const window = {
      start: new Date(day("2026-01-01")),
      end: new Date(day("2026-01-30") + DAY - 1),
    };
    expect(coverageBounds(window, now)).toEqual({
      window_start: "2026-01-01",
      window_end: "2026-01-30",
    });
  });
});

describe("etagForWindow / coveredDayKeys", () => {
  it("finds the ETag stored for an identically bounded window", () => {
    const covered = [
      { window_start: "2026-01-01", window_end: "2026-01-30", etag: '"a"' },
      { window_start: "2026-01-31", window_end: "2026-03-01", etag: '"b"' },
    ];
    const window = {
      start: new Date(day("2026-01-01")),
      end: new Date(day("2026-01-30") + DAY - 1),
    };
    expect(etagForWindow(covered, window, now)).toBe('"a"');
    const other = {
      start: new Date(day("2026-01-02")),
      end: new Date(day("2026-01-30") + DAY - 1),
    };
    expect(etagForWindow(covered, other, now)).toBeUndefined();
  });

  it("expands covered windows into day keys", () => {
    const keys = coveredDayKeys([{ window_start: "2026-02-27", window_end: "2026-03-02" }]);
    expect([...keys]).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });
});
