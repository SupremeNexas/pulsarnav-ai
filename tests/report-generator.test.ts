/**
 * tests/report-generator.test.ts
 *
 * Unit tests for lib/report-generator.ts — buildNavigationReport and reportFilename.
 *
 * Invariants tested:
 *  1. Report contains mandatory section headers.
 *  2. Report includes config values from SimResult.
 *  3. Numeric formatting is correct (.toFixed(4) for errors).
 *  4. Filename is slugified correctly for each mission type.
 *  5. No undefined/NaN strings appear in output.
 */

import { describe, it, expect } from "vitest";
import { buildNavigationReport, reportFilename } from "../lib/report-generator";
import type { SimResult } from "../lib/navigation-simulator";

/** Minimal mock SimResult for testing report generation without running full simulation */
function makeMockResult(missionType: string = "LEO"): SimResult {
  return {
    config: {
      missionType,
      pulsarCount: 6,
      noiseNs: 100,
      dsnInterval: 12,
      detectorArea: 1.0,
      integrationTime: 3600,
    },
    steps: [],
    dsnSummary: {
      meanError:   1.2345,
      medianError: 1.1000,
      p95Error:    2.5000,
      maxError:    5.7890,
      meanVelError: 0.000123,
      maxVelError:  0.001234,
    },
    pulsarSummary: {
      meanError:   0.5432,
      medianError: 0.5000,
      p95Error:    1.2000,
      maxError:    2.3456,
      meanVelError: 0.000056,
      maxVelError:  0.000567,
    },
    hybridSummary: {
      meanError:   0.3210,
      medianError: 0.3000,
      p95Error:    0.8000,
      maxError:    1.2345,
      meanVelError: 0.000034,
      maxVelError:  0.000345,
    },
    benchmarks: {
      dsnTimeMs:    1.234,
      pulsarTimeMs: 2.567,
      hybridTimeMs: 4.891,
      dsnMemoryKb:    3.375,
      pulsarMemoryKb: 12.5,
      hybridMemoryKb: 13.5,
      dsnCpuPct:    2.56,
      pulsarCpuPct: 5.32,
      hybridCpuPct: 10.12,
    },
  };
}

describe("buildNavigationReport — section headers", () => {
  it("contains all 5 mandatory section headers", () => {
    const report = buildNavigationReport(makeMockResult());
    expect(report).toContain("EXECUTIVE SUMMARY");
    expect(report).toContain("ACCURACY & PERFORMANCE KPI ANALYSIS");
    expect(report).toContain("VELOCITY ERROR ANALYSIS");
    expect(report).toContain("COMPUTATION BENCHMARKS");
    expect(report).toContain("DETAILED ENGINEERING DISCUSSION");
  });

  it("starts with the PulsarNav AI title", () => {
    const report = buildNavigationReport(makeMockResult());
    expect(report).toMatch(/^# PulsarNav AI/);
  });
});

describe("buildNavigationReport — config values", () => {
  it("includes mission type in report", () => {
    const report = buildNavigationReport(makeMockResult("Earth-Mars Transfer"));
    expect(report).toContain("Earth-Mars Transfer");
  });

  it("includes pulsar count", () => {
    const report = buildNavigationReport(makeMockResult());
    expect(report).toContain("6 sources");
  });

  it("includes noise level", () => {
    const report = buildNavigationReport(makeMockResult());
    expect(report).toContain("100 ns");
  });

  it("includes DSN interval", () => {
    const report = buildNavigationReport(makeMockResult());
    expect(report).toContain("12 Hours");
  });
});

describe("buildNavigationReport — numeric formatting", () => {
  it("formats mean error to 4 decimal places", () => {
    const report = buildNavigationReport(makeMockResult());
    // DSN mean error = 1.2345
    expect(report).toContain("1.2345");
    // Pulsar mean error = 0.5432
    expect(report).toContain("0.5432");
    // Hybrid mean error = 0.3210
    expect(report).toContain("0.3210");
  });

  it("formats benchmark timing to 3 decimal places", () => {
    const report = buildNavigationReport(makeMockResult());
    // DSN wall time = 1.234 ms
    expect(report).toContain("1.234");
    // Hybrid wall time = 4.891 ms
    expect(report).toContain("4.891");
  });
});

describe("buildNavigationReport — no undefined/NaN in output", () => {
  it("does not contain 'undefined' string", () => {
    const report = buildNavigationReport(makeMockResult());
    expect(report).not.toContain("undefined");
  });

  it("does not contain 'NaN' string", () => {
    const report = buildNavigationReport(makeMockResult());
    expect(report).not.toContain("NaN");
  });

  it("is a non-empty string", () => {
    const report = buildNavigationReport(makeMockResult());
    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(200);
  });
});

describe("reportFilename", () => {
  it("produces lowercase with underscores", () => {
    expect(reportFilename("LEO")).toBe("pulsarnav_comparison_report_leo.md");
    expect(reportFilename("Earth-Moon Transfer")).toBe("pulsarnav_comparison_report_earth_moon_transfer.md");
    expect(reportFilename("Deep Space Cruise")).toBe("pulsarnav_comparison_report_deep_space_cruise.md");
    expect(reportFilename("Lagrange L1/L2 Halo")).toBe("pulsarnav_comparison_report_lagrange_l1/l2_halo.md");
  });

  it("ends with .md", () => {
    expect(reportFilename("LEO")).toMatch(/\.md$/);
    expect(reportFilename("Earth-Mars Transfer")).toMatch(/\.md$/);
  });
});
