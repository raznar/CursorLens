import { describe, expect, it } from "vitest";
import {
  chartColor,
  formatCents,
  formatCompact,
  formatDate,
  formatNumber,
  formatPercent,
} from "./format";

describe("formatters", () => {
  it("formats numbers and compact numbers", () => {
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatCompact(1234)).toBe("1.2K");
    expect(formatCompact(3_400_000)).toBe("3.4M");
  });

  it("formats cents as USD", () => {
    expect(formatCents(2450)).toBe("$24.50");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(123456, { compact: true })).toBe("$1.2K");
  });

  it("formats percentages from ratios", () => {
    expect(formatPercent(0.2257)).toBe("22.6%");
    expect(formatPercent(1)).toBe("100.0%");
    expect(formatPercent(Number.NaN)).toBe("—");
  });

  it("formats epoch-millis strings and numbers as dates", () => {
    expect(formatDate("1710720000000", "yyyy-MM-dd")).toBe("2024-03-18");
    expect(formatDate(1710720000000, "yyyy-MM-dd")).toBe("2024-03-18");
    expect(formatDate("2025-01-15", "yyyy-MM-dd")).toBe("2025-01-15");
  });

  it("wraps the chart palette", () => {
    expect(chartColor(0)).toBe("hsl(var(--chart-1))");
    expect(chartColor(8)).toBe("hsl(var(--chart-1))");
    expect(chartColor(2)).toBe("hsl(var(--chart-3))");
  });
});
