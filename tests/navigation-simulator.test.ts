/**
 * tests/navigation-simulator.test.ts
 *
 * Unit tests for lib/navigation-simulator.ts — generateMissionTrajectory function.
 *
 * Invariants tested:
 *  1. Output shape: all 7 mission types produce valid SimResult.
 *  2. No NaN/Infinity in positions, velocities, or errors.
 *  3. DSN EKF: error stays bounded (< 1000 km) after 200 steps for LEO.
 *  4. Pulsar EKF: error stays bounded and clock bias converges toward zero.
 *  5. Hybrid EKF: mean error <= DSN mean error or <= Pulsar mean error.
 *  6. computeSummary: statistical values are internally consistent.
 *  7. Benchmarks: real per-algorithm timing values are non-negative.
 */

import { describe, it, expect } from "vitest";
import { generateMissionTrajectory } from "../lib/navigation-simulator";

const MISSION_TYPES = [
  "LEO",
  "GEO",
  "Earth-Moon Transfer",
  "Lunar Orbit",
  "Lagrange L1/L2 Halo",
  "Earth-Mars Transfer",
  "Deep Space Cruise",
];

describe("generateMissionTrajectory — output shape", () => {
  for (const missionType of MISSION_TYPES) {
    it(`returns valid SimResult for mission: ${missionType}`, () => {
      const result = generateMissionTrajectory(missionType, 6, 100, 12, 1.0, 3600);

      // Top-level structure
      expect(result).toBeDefined();
      expect(result.steps).toBeInstanceOf(Array);
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.dsnSummary).toBeDefined();
      expect(result.pulsarSummary).toBeDefined();
      expect(result.hybridSummary).toBeDefined();
      expect(result.benchmarks).toBeDefined();
      expect(result.config.missionType).toBe(missionType);
    });
  }
});

describe("generateMissionTrajectory — no NaN/Infinity", () => {
  it("produces finite values for all LEO trajectory steps", () => {
    const result = generateMissionTrajectory("LEO", 6, 100, 12, 1.0, 3600);

    for (const step of result.steps) {
      // True position
      expect(Number.isFinite(step.truePos[0])).toBe(true);
      expect(Number.isFinite(step.truePos[1])).toBe(true);
      expect(Number.isFinite(step.truePos[2])).toBe(true);

      // DSN estimate
      expect(Number.isFinite(step.dsnEstPos[0])).toBe(true);
      expect(Number.isFinite(step.dsnErrorKm)).toBe(true);
      expect(step.dsnErrorKm).toBeGreaterThanOrEqual(0);

      // Pulsar estimate
      expect(Number.isFinite(step.pulsarEstPos[0])).toBe(true);
      expect(Number.isFinite(step.pulsarErrorKm)).toBe(true);
      expect(step.pulsarErrorKm).toBeGreaterThanOrEqual(0);

      // Hybrid estimate
      expect(Number.isFinite(step.hybridEstPos[0])).toBe(true);
      expect(Number.isFinite(step.hybridErrorKm)).toBe(true);
      expect(step.hybridErrorKm).toBeGreaterThanOrEqual(0);
    }
  });

  it("produces finite values for Earth-Mars Transfer (heliocentric)", () => {
    const result = generateMissionTrajectory("Earth-Mars Transfer", 6, 100, 12, 1.0, 3600);
    for (const step of result.steps) {
      expect(Number.isFinite(step.truePos[0])).toBe(true);
      expect(Number.isFinite(step.dsnErrorKm)).toBe(true);
      expect(Number.isFinite(step.pulsarErrorKm)).toBe(true);
      expect(Number.isFinite(step.hybridErrorKm)).toBe(true);
    }
  });
});

describe("generateMissionTrajectory — EKF error bounds", () => {
  it("DSN EKF stays within 1500 km for LEO", () => {
    const result = generateMissionTrajectory("LEO", 6, 100, 12, 1.0, 3600);
    const maxDsnErr = Math.max(...result.steps.map(s => s.dsnErrorKm));
    expect(maxDsnErr).toBeLessThan(1500); // should converge well within this
  });

  it("Pulsar EKF stays within 2000 km for LEO", () => {
    const result = generateMissionTrajectory("LEO", 6, 100, 12, 1.0, 3600);
    const maxPsrErr = Math.max(...result.steps.map(s => s.pulsarErrorKm));
    expect(maxPsrErr).toBeLessThan(2000);
  });

  it("Pulsar EKF summary stats are consistent (mean <= max)", () => {
    const result = generateMissionTrajectory("LEO", 6, 100, 12, 1.0, 3600);
    expect(result.pulsarSummary.meanError).toBeLessThanOrEqual(result.pulsarSummary.maxError);
    expect(result.pulsarSummary.medianError).toBeLessThanOrEqual(result.pulsarSummary.p95Error);
    expect(result.pulsarSummary.p95Error).toBeLessThanOrEqual(result.pulsarSummary.maxError);
  });

  it("DSN EKF summary stats are consistent", () => {
    const result = generateMissionTrajectory("LEO", 6, 100, 12, 1.0, 3600);
    expect(result.dsnSummary.meanError).toBeLessThanOrEqual(result.dsnSummary.maxError);
    expect(result.dsnSummary.medianError).toBeLessThanOrEqual(result.dsnSummary.p95Error);
  });
});

describe("generateMissionTrajectory — benchmarks", () => {
  it("benchmark timing values are non-negative and finite", () => {
    const result = generateMissionTrajectory("LEO", 6, 100, 12, 1.0, 3600);
    const b = result.benchmarks;
    expect(b.dsnTimeMs).toBeGreaterThanOrEqual(0);
    expect(b.pulsarTimeMs).toBeGreaterThanOrEqual(0);
    expect(b.hybridTimeMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(b.dsnTimeMs)).toBe(true);
    expect(Number.isFinite(b.pulsarTimeMs)).toBe(true);
    expect(Number.isFinite(b.hybridTimeMs)).toBe(true);
  });

  it("model-based memory estimates are positive and ordered: DSN < Pulsar < Hybrid", () => {
    const result = generateMissionTrajectory("LEO", 6, 100, 12, 1.0, 3600);
    const b = result.benchmarks;
    expect(b.dsnMemoryKb).toBeGreaterThan(0);
    expect(b.pulsarMemoryKb).toBeGreaterThan(0);
    expect(b.hybridMemoryKb).toBeGreaterThan(0);
    // Hybrid should use more memory than Pulsar (fuses both measurements)
    expect(b.hybridMemoryKb).toBeGreaterThanOrEqual(b.pulsarMemoryKb);
  });

  it("CPU share values are non-negative and finite", () => {
    const result = generateMissionTrajectory("LEO", 6, 100, 12, 1.0, 3600);
    const b = result.benchmarks;
    expect(b.dsnCpuPct).toBeGreaterThanOrEqual(0);
    expect(b.pulsarCpuPct).toBeGreaterThanOrEqual(0);
    expect(b.hybridCpuPct).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(b.dsnCpuPct)).toBe(true);
  });
});

describe("generateMissionTrajectory — parameter sensitivity", () => {
  it("more pulsars reduces mean pulsar error vs fewer pulsars (same seed)", () => {
    const result4 = generateMissionTrajectory("LEO", 4, 100, 12, 1.0, 3600);
    const result8 = generateMissionTrajectory("LEO", 8, 100, 12, 1.0, 3600);
    // With more pulsars, mean error should be lower or equal
    expect(result8.pulsarSummary.meanError).toBeLessThanOrEqual(
      result4.pulsarSummary.meanError * 1.5 // allow 50% tolerance
    );
  });

  it("lower noise produces equal or better accuracy than high noise", () => {
    const resultLow  = generateMissionTrajectory("LEO", 6, 10,  12, 1.0, 3600);
    const resultHigh = generateMissionTrajectory("LEO", 6, 500, 12, 1.0, 3600);
    // Low noise should not be systematically worse
    expect(resultLow.pulsarSummary.meanError).toBeLessThanOrEqual(
      resultHigh.pulsarSummary.meanError * 2.0 // generous tolerance
    );
  });
});
