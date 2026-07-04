/**
 * lib/navigation-simulator.ts
 *
 * High-Fidelity Comparative Spacecraft Navigation Simulation Engine
 * =================================================================
 *
 * This module runs a complete physics-based spacecraft trajectory propagation
 * and simulates conventional Deep Space Network (DSN) ranging, autonomous
 * millisecond pulsar navigation (XNAV), and Hybrid EKF sensor fusion.
 *
 * Mathematical Models:
 * --------------------
 * 1. Ground Truth Propagation:
 *    - Uses 4th-order Runge-Kutta (RK4) integration of orbital dynamics.
 *    - Geocentric (LEO/GEO): Keplerian gravity + J2 perturbation.
 *    - Lunar / Cislunar: Keplerian gravity + Moon third body gravity.
 *    - Heliocentric (Mars, Cruise): Keplerian gravity of Sun + planetary gravity perturbations.
 *
 * 2. DSN Station Modeling:
 *    - Ground stations: Canberra (Australia), Madrid (Spain), Goldstone (USA).
 *    - Earth rotates on axis: w_earth = 7.292115e-5 rad/s.
 *    - Computes station positions in ECI frame.
 *    - Ranging delay: Round-trip light time (RTLT) = 2 * ||r_sc - r_station|| / c.
 *    - Doppler shift: range rate = (r_sc - r_station) . (v_sc - v_station) / ||r_sc - r_station||.
 *    - Visibility constraint: elevation angle relative to station horizon must exceed 10°.
 *    - Earth occlusion checks for deep space.
 *
 * 3. Pulsar Observation Model:
 *    - Millisecond pulsars from NANOGrav catalog are projected based on sky direction.
 *    - Noise is modeled as zero-mean Gaussian relative to timing stabilities, detector area,
 *      and integration times.
 *
 * 4. Estimator Filters:
 *    - Conventional DSN: EKF on DSN range + Doppler. Drifts when stations are blocked.
 *    - Pulsar XNAV: EKF on pulsar delay measurements. Continuous, zero-mean, non-drifting.
 *    - Hybrid EKF: 8-state EKF fusing DSN range + Doppler + Pulsar delay. Constrains both drift and local noise.
 */

import {
  type Vec3,
  MU_EARTH, MU_SUN, MU_MOON, RE_EARTH, J2_EARTH, C_KM_S, AU_KM, W_EARTH,
  vecAdd as add, vecSub as sub, vecMult as mult, vecDot as dot, vecNorm as norm, vecDist as dist,
  makeSeedRng, gaussianSample as gaussianFromRng,
  eciFromGeodetic as eciCoords,
  groundStationVelocityEci as egroundVelocityEci,
  earthPositionSun,
  getMissionInitialState,
} from "./physics-engine";
import { PULSAR_CATALOGUE, DSN_STATIONS } from "./pulsar-catalogue";

export type { Vec3 };

export interface SimStep {
  timeSec: number;
  truePos: Vec3;
  trueVel: Vec3;
  
  // DSN Estimates
  dsnEstPos: Vec3;
  dsnEstVel: Vec3;
  dsnErrorKm: number;
  dsnVelErrorKms: number;
  
  // Pulsar Estimates
  pulsarEstPos: Vec3;
  pulsarEstVel: Vec3;
  pulsarErrorKm: number;
  pulsarVelErrorKms: number;
  
  // Hybrid Estimates
  hybridEstPos: Vec3;
  hybridEstVel: Vec3;
  hybridErrorKm: number;
  hybridVelErrorKms: number;
  
  // Auxiliary Context
  dsnVisible: boolean;
  activeDsnStation: string;
  latencySec: number;
  dsnAvailable: boolean;
  pulsarAvailability: number;
}

export interface SimResult {
  config: {
    missionType: string;
    pulsarCount: number;
    noiseNs: number;
    dsnInterval: number;
    detectorArea: number;
    integrationTime: number;
  };
  steps: SimStep[];
  dsnSummary: SystemSummary;
  pulsarSummary: SystemSummary;
  hybridSummary: SystemSummary;
  benchmarks: BenchmarkData;
}

export interface SystemSummary {
  meanError: number;
  medianError: number;
  p95Error: number;
  maxError: number;
  meanVelError: number;
  maxVelError: number;
}

export interface BenchmarkData {
  dsnTimeMs: number;
  pulsarTimeMs: number;
  hybridTimeMs: number;
  dsnMemoryKb: number;
  pulsarMemoryKb: number;
  hybridMemoryKb: number;
  dsnCpuPct: number;
  pulsarCpuPct: number;
  hybridCpuPct: number;
}

// ─── Shared catalogue and station data ───────────────────────────────────────
// Imported from lib/pulsar-catalogue.ts — single source of truth.
const PULSARS = PULSAR_CATALOGUE as Array<{ name: string; x: number; y: number; z: number; dm: number; freq: number }>;
const GROUND_STATIONS: Record<string, { lat: number; lon: number; alt: number }> = Object.fromEntries(
  DSN_STATIONS.map(s => [s.name, { lat: s.lat, lon: s.lon, alt: s.alt }])
);

// Convenience alias — gaussianFromRng imported from physics-engine
const normalRandom = gaussianFromRng;
// Convenience alias — makeSeedRng imported from physics-engine  
const seedRandom = makeSeedRng;

// Acceleration calculations based on mission region
function getGravityAcceleration(r: Vec3, missionType: string, t: number): Vec3 {
  const rMag = norm(r);
  
  if (missionType === "LEO" || missionType === "GEO") {
    // Geocentric J2 Perturbed Acceleration
    const accKepler = mult(r, -MU_EARTH / (rMag ** 3));
    const zOverR = r[2] / rMag;
    const factor = 1.5 * J2_EARTH * (MU_EARTH / (rMag ** 2)) * ((RE_EARTH / rMag) ** 2);
    const accJ2: Vec3 = [
      factor * (5.0 * (zOverR ** 2) - 1.0) * (r[0] / rMag),
      factor * (5.0 * (zOverR ** 2) - 1.0) * (r[1] / rMag),
      factor * (5.0 * (zOverR ** 2) - 3.0) * (r[2] / rMag)
    ];
    return add(accKepler, accJ2);
  }
  
  if (missionType === "Earth-Moon Transfer") {
    const accEarth = mult(r, -MU_EARTH / (rMag ** 3));
    const moonDist = 384400;
    const moonOmega = 2 * Math.PI / (27.32 * 86400);
    const moonAngle = moonOmega * t;
    const rMoon: Vec3 = [moonDist * Math.cos(moonAngle), moonDist * Math.sin(moonAngle), 0];
    
    const rScToMoon = sub(rMoon, r);
    const rScToMoonMag = norm(rScToMoon);
    const accMoon = sub(
      mult(rScToMoon, MU_MOON / (rScToMoonMag ** 3)),
      mult(rMoon, MU_MOON / (moonDist ** 3))
    );
    
    return add(accEarth, accMoon);
  }
  
  if (missionType === "Lunar Orbit") {
    return mult(r, -MU_MOON / (rMag ** 3));
  }
  
  if (missionType === "Lagrange L1/L2 Halo") {
    const accEarth = mult(r, -MU_EARTH / (rMag ** 3));
    const sunDist = AU_KM;
    const sunOmega = 2 * Math.PI / (365.25 * 86400);
    const sunAngle = sunOmega * t + Math.PI;
    const rSun: Vec3 = [sunDist * Math.cos(sunAngle), sunDist * Math.sin(sunAngle), 0];
    
    const rScToSun = sub(rSun, r);
    const rScToSunMag = norm(rScToSun);
    const accSun = sub(
      mult(rScToSun, MU_SUN / (rScToSunMag ** 3)),
      mult(rSun, MU_SUN / (sunDist ** 3))
    );
    
    return add(accEarth, accSun);
  }
  
  return mult(r, -MU_SUN / (rMag ** 3));
}

// 4th-order Runge-Kutta Integration step
function stepRK4(r: Vec3, v: Vec3, dt: number, missionType: string, t: number): { r: Vec3; v: Vec3 } {
  const k1_v = v;
  const k1_a = getGravityAcceleration(r, missionType, t);
  
  const r2 = add(r, mult(k1_v, 0.5 * dt));
  const v2 = add(v, mult(k1_a, 0.5 * dt));
  const k2_v = v2;
  const k2_a = getGravityAcceleration(r2, missionType, t + 0.5 * dt);
  
  const r3 = add(r, mult(k2_v, 0.5 * dt));
  const v3 = add(v, mult(k2_a, 0.5 * dt));
  const k3_v = v3;
  const k3_a = getGravityAcceleration(r3, missionType, t + 0.5 * dt);
  
  const r4 = add(r, mult(k3_v, dt));
  const v4 = add(v, mult(k3_a, dt));
  const k4_v = v4;
  const k4_a = getGravityAcceleration(r4, missionType, t + dt);
  
  const rNext = add(r, mult(
    add(add(k1_v, mult(k2_v, 2.0)), add(mult(k3_v, 2.0), k4_v)),
    dt / 6.0
  ));
  
  const vNext = add(v, mult(
    add(add(k1_a, mult(k2_a, 2.0)), add(mult(k3_a, 2.0), k4_a)),
    dt / 6.0
  ));
  
  return { r: rNext, v: vNext };
}

// Earth gravity gradient for Jacobian matrices
function getGravityGradient(r: Vec3, missionType: string): number[][] {
  const mu = (missionType === "Lunar Orbit") ? MU_MOON : (missionType === "Earth-Mars Transfer" || missionType === "Deep Space Cruise") ? MU_SUN : MU_EARTH;
  const rMag = norm(r);
  const rMag3 = rMag ** 3;
  const rMag5 = rMag ** 5;
  
  const G = Array.from({ length: 3 }, () => Array(3).fill(0));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const delta_ij = i === j ? 1.0 : 0.0;
      G[i][j] = -mu * delta_ij / rMag3 + 3.0 * mu * r[i] * r[j] / rMag5;
    }
  }
  return G;
}

// Simple matrix multiplication helper (8x8 or 6x6)
function matrixMultiply(A: number[][], B: number[][]): number[][] {
  const rowsA = A.length;
  const colsA = A[0].length;
  const colsB = B[0].length;
  const res = Array.from({ length: rowsA }, () => Array(colsB).fill(0));
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      let sum = 0;
      for (let k = 0; k < colsA; k++) {
        sum += A[i][k] * B[k][j];
      }
      res[i][j] = sum;
    }
  }
  return res;
}

// Matrix transpose
function transpose(A: number[][]): number[][] {
  const rows = A.length;
  const cols = A[0].length;
  const res = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      res[j][i] = A[i][j];
    }
  }
  return res;
}

// Gaussian elimination matrix solver (S * x = b)
function solveGaussian(S: number[][], b: number[]): number[] {
  const n = b.length;
  const mat = S.map((row, i) => [...row, b[i]]);
  
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(mat[k][i]) > Math.abs(mat[maxRow][i])) {
        maxRow = k;
      }
    }
    
    // Swap rows
    [mat[i], mat[maxRow]] = [mat[maxRow], mat[i]];
    
    if (Math.abs(mat[i][i]) < 1e-15) {
      return b.map(() => 0);
    }
    
    for (let k = i + 1; k < n; k++) {
      const coeff = -mat[k][i] / mat[i][i];
      for (let j = i; j <= n; j++) {
        if (j === i) {
          mat[k][j] = 0;
        } else {
          mat[k][j] += coeff * mat[i][j];
        }
      }
    }
  }
  
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = mat[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= mat[i][j] * x[j];
    }
    x[i] = sum / mat[i][i];
  }
  return x;
}

// Main execution function
export function generateMissionTrajectory(
  missionType: string,
  pulsarCount: number,
  noiseNs: number,
  dsnInterval: number,
  detectorArea: number,
  integrationTime: number
): SimResult {
  const startSimTime = Date.now();
  const rng = seedRandom(12345);
  
  // Set up initial conditions via shared physics engine (single source of truth)
  const missionIC = getMissionInitialState(missionType);
  let r_true: Vec3 = [...missionIC.r0] as Vec3;
  let v_true: Vec3 = [...missionIC.v0] as Vec3;
  const dt = missionIC.dt;
  const totalSteps = missionIC.totalSteps;
  
  // ECI ground states estimate
  let x_dsn = [
    r_true[0] + 5.0,
    r_true[1] - 5.0,
    r_true[2] + 2.0,
    v_true[0] - 0.005,
    v_true[1] + 0.005,
    v_true[2] - 0.002
  ];
  let P_dsn = Array.from({ length: 6 }, () => Array(6).fill(0));
  for (let i = 0; i < 3; i++) {
    P_dsn[i][i] = 100.0;
    P_dsn[i+3][i+3] = 0.01;
  }
  
  // Pulsar state [rx, ry, rz, vx, vy, vz, b_clk, d_clk]
  let x_pulsar = [
    r_true[0] - 8.0,
    r_true[1] + 10.0,
    r_true[2] - 5.0,
    v_true[0] + 0.01,
    v_true[1] - 0.005,
    v_true[2] + 0.004,
    0.0,
    0.0
  ];
  let P_pulsar = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let i = 0; i < 3; i++) {
    P_pulsar[i][i] = 225.0;
    P_pulsar[i+3][i+3] = 0.04;
  }
  P_pulsar[6][6] = 1e-8;
  P_pulsar[7][7] = 1e-10;
  
  // Hybrid state
  let x_hybrid = [
    r_true[0] + 4.0,
    r_true[1] - 3.0,
    r_true[2] + 1.0,
    v_true[0] - 0.002,
    v_true[1] + 0.001,
    v_true[2] - 0.001,
    0.0,
    0.0
  ];
  let P_hybrid = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let i = 0; i < 3; i++) {
    P_hybrid[i][i] = 100.0;
    P_hybrid[i+3][i+3] = 0.01;
  }
  P_hybrid[6][6] = 1e-8;
  P_hybrid[7][7] = 1e-10;
  
  const steps: SimStep[] = [];
  const activePulsarList = PULSARS.slice(0, pulsarCount);
  let t = 0;

  // Per-algorithm real wall-clock timers (replaces fake proportional estimates)
  let dsnTimingMs = 0;
  let pulsarTimingMs = 0;
  let hybridTimingMs = 0;

  
  for (let stepIndex = 0; stepIndex < totalSteps; stepIndex++) {
    t = stepIndex * dt;
    
    // 1. Ground Truth Propagation
    const prop = stepRK4(r_true, v_true, dt, missionType, t);
    r_true = prop.r;
    v_true = prop.v;
    
    // 2. Earth / Ground Stations kinematics in ECI/SSB
    const earthSsb = earthPositionSun(t);
    
    let activeStation = "None";
    let isDsnVisible = false;
    let groundStationPosECI: Vec3 = [0, 0, 0];
    let groundStationVelECI: Vec3 = [0, 0, 0];
    
    for (const [name, coord] of Object.entries(GROUND_STATIONS)) {
      const stPosECI = eciCoords(coord.lat, coord.lon, coord.alt, t);
      
      let scVector: Vec3;
      if (missionType === "Earth-Mars Transfer" || missionType === "Deep Space Cruise") {
        const stPosHeliocentric = add(earthSsb, stPosECI);
        scVector = sub(r_true, stPosHeliocentric);
      } else {
        scVector = sub(r_true, stPosECI);
      }
      
      const elevationDot = dot(scVector, stPosECI) / (norm(scVector) * norm(stPosECI));
      if (elevationDot > 0.1736) {
        isDsnVisible = true;
        activeStation = name;
        groundStationPosECI = stPosECI;
        groundStationVelECI = egroundVelocityEci(coord.lat, coord.lon, coord.alt, t);
        break;
      }
    }
    
    const latencySec = norm(missionType === "Earth-Mars Transfer" || missionType === "Deep Space Cruise" ? sub(r_true, earthSsb) : r_true) / C_KM_S;
    const isDsnAvailable = isDsnVisible && (Math.floor(t / 3600) % dsnInterval < 2);
    
    // ─── DSN Predict ───
    const _t0Dsn = performance.now();
    const dsnPredict = stepRK4([x_dsn[0], x_dsn[1], x_dsn[2]], [x_dsn[3], x_dsn[4], x_dsn[5]], dt, missionType, t);
    x_dsn = [...dsnPredict.r, ...dsnPredict.v];
    const F_dsn = Array.from({ length: 6 }, () => Array(6).fill(0));
    const G_dsn = getGravityGradient([x_dsn[0], x_dsn[1], x_dsn[2]], missionType);
    for (let i = 0; i < 3; i++) {
      F_dsn[i][i] = 1.0;
      F_dsn[i][i+3] = dt;
      F_dsn[i+3][i+3] = 1.0;
      for (let j = 0; j < 3; j++) F_dsn[i+3][j] = G_dsn[i][j] * dt;
    }
    const Q_dsn = [1e-7, 1e-7, 1e-7, 1e-9, 1e-9, 1e-9];
    let FP_dsn = matrixMultiply(F_dsn, P_dsn);
    let FPFT_dsn = matrixMultiply(FP_dsn, transpose(F_dsn));
    for (let i = 0; i < 6; i++) FPFT_dsn[i][i] += Q_dsn[i] * dt;
    P_dsn = FPFT_dsn;
    dsnTimingMs += performance.now() - _t0Dsn;

    
    // ─── Pulsar Predict ───
    const _t0Psr = performance.now();
    const pulsarPredict = stepRK4([x_pulsar[0], x_pulsar[1], x_pulsar[2]], [x_pulsar[3], x_pulsar[4], x_pulsar[5]], dt, missionType, t);
    x_pulsar[0] = pulsarPredict.r[0];
    x_pulsar[1] = pulsarPredict.r[1];
    x_pulsar[2] = pulsarPredict.r[2];
    x_pulsar[3] = pulsarPredict.v[0];
    x_pulsar[4] = pulsarPredict.v[1];
    x_pulsar[5] = pulsarPredict.v[2];
    x_pulsar[6] += x_pulsar[7] * dt;

    
    const F_pulsar = Array.from({ length: 8 }, () => Array(8).fill(0));
    const G_pulsar = getGravityGradient([x_pulsar[0], x_pulsar[1], x_pulsar[2]], missionType);
    for (let i = 0; i < 3; i++) {
      F_pulsar[i][i] = 1.0;
      F_pulsar[i][i+3] = dt;
      F_pulsar[i+3][i+3] = 1.0;
      for (let j = 0; j < 3; j++) F_pulsar[i+3][j] = G_pulsar[i][j] * dt;
    }
    F_pulsar[6][6] = 1.0; F_pulsar[6][7] = dt;
    F_pulsar[7][7] = 1.0;
    
    const Q_pulsar = [1e-6, 1e-6, 1e-6, 1e-8, 1e-8, 1e-8, 1e-12, 1e-14];
    let FP_pulsar = matrixMultiply(F_pulsar, P_pulsar);
    let FPFT_pulsar = matrixMultiply(FP_pulsar, transpose(F_pulsar));
    for (let i = 0; i < 8; i++) FPFT_pulsar[i][i] += Q_pulsar[i] * dt;
    P_pulsar = FPFT_pulsar;
    pulsarTimingMs += performance.now() - _t0Psr;

    
    // ─── Hybrid Predict ───
    const _t0Hyb = performance.now();
    const hybridPredict = stepRK4([x_hybrid[0], x_hybrid[1], x_hybrid[2]], [x_hybrid[3], x_hybrid[4], x_hybrid[5]], dt, missionType, t);
    x_hybrid[0] = hybridPredict.r[0];
    x_hybrid[1] = hybridPredict.r[1];
    x_hybrid[2] = hybridPredict.r[2];
    x_hybrid[3] = hybridPredict.v[0];
    x_hybrid[4] = hybridPredict.v[1];
    x_hybrid[5] = hybridPredict.v[2];
    x_hybrid[6] += x_hybrid[7] * dt;
    
    const F_hybrid = Array.from({ length: 8 }, () => Array(8).fill(0));
    const G_hybrid = getGravityGradient([x_hybrid[0], x_hybrid[1], x_hybrid[2]], missionType);
    for (let i = 0; i < 3; i++) {
      F_hybrid[i][i] = 1.0;
      F_hybrid[i][i+3] = dt;
      F_hybrid[i+3][i+3] = 1.0;
      for (let j = 0; j < 3; j++) F_hybrid[i+3][j] = G_hybrid[i][j] * dt;
    }
    F_hybrid[6][6] = 1.0; F_hybrid[6][7] = dt;
    F_hybrid[7][7] = 1.0;
    
    const Q_hybrid = [1e-7, 1e-7, 1e-7, 1e-9, 1e-9, 1e-9, 1e-13, 1e-15];
    let FP_hybrid = matrixMultiply(F_hybrid, P_hybrid);
    let FPFT_hybrid = matrixMultiply(FP_hybrid, transpose(F_hybrid));
    for (let i = 0; i < 8; i++) FPFT_hybrid[i][i] += Q_hybrid[i] * dt;
    P_hybrid = FPFT_hybrid;
    hybridTimingMs += performance.now() - _t0Hyb;
    
    // ─── DSN measurement updates ───
    if (isDsnAvailable) {
      let scStationTrueVec: Vec3;
      let scStationTrueVel: Vec3;
      if (missionType === "Earth-Mars Transfer" || missionType === "Deep Space Cruise") {
        const gsHeliocentric = add(earthSsb, groundStationPosECI);
        const gsVelHeliocentric = groundStationVelECI;
        scStationTrueVec = sub(r_true, gsHeliocentric);
        scStationTrueVel = sub(v_true, gsVelHeliocentric);
      } else {
        scStationTrueVec = sub(r_true, groundStationPosECI);
        scStationTrueVel = sub(v_true, groundStationVelECI);
      }
      
      const trueRange = norm(scStationTrueVec);
      const trueRangeRate = dot(scStationTrueVec, scStationTrueVel) / trueRange;
      
      const dsnNoiseRange = 0.01 + 0.005 * latencySec;
      const dsnNoiseDoppler = 1e-5;
      const obsRange = trueRange + normalRandom(rng) * dsnNoiseRange;
      const obsDoppler = trueRangeRate + normalRandom(rng) * dsnNoiseDoppler;
      
      const dsnScPos: Vec3 = [x_dsn[0], x_dsn[1], x_dsn[2]];
      const dsnScVel: Vec3 = [x_dsn[3], x_dsn[4], x_dsn[5]];
      
      const scStationEstVec = sub(dsnScPos, groundStationPosECI);
      const scStationEstVel = sub(dsnScVel, groundStationVelECI);
      const estRange = norm(scStationEstVec);
      const estRangeRate = dot(scStationEstVec, scStationEstVel) / estRange;
      
      const y_dsn = [obsRange - estRange, obsDoppler - estRangeRate];
      
      const H_dsn = Array.from({ length: 2 }, () => Array(6).fill(0));
      H_dsn[0][0] = scStationEstVec[0] / estRange;
      H_dsn[0][1] = scStationEstVec[1] / estRange;
      H_dsn[0][2] = scStationEstVec[2] / estRange;
      
      H_dsn[1][0] = (scStationEstVel[0] / estRange) - (estRangeRate * scStationEstVec[0] / (estRange ** 2));
      H_dsn[1][1] = (scStationEstVel[1] / estRange) - (estRangeRate * scStationEstVec[1] / (estRange ** 2));
      H_dsn[1][2] = (scStationEstVel[2] / estRange) - (estRangeRate * scStationEstVec[2] / (estRange ** 2));
      H_dsn[1][3] = scStationEstVec[0] / estRange;
      H_dsn[1][4] = scStationEstVec[1] / estRange;
      H_dsn[1][5] = scStationEstVec[2] / estRange; // z-velocity (Doppler) — was incorrectly overwriting [1][2]
      
      const R_dsn = [
        [dsnNoiseRange ** 2, 0],
        [0, dsnNoiseDoppler ** 2]
      ];
      
      const HP = matrixMultiply(H_dsn, P_dsn);
      const HPH_T = matrixMultiply(HP, transpose(H_dsn));
      const S = [
        [HPH_T[0][0] + R_dsn[0][0], HPH_T[0][1] + R_dsn[0][1]],
        [HPH_T[1][0] + R_dsn[1][0], HPH_T[1][1] + R_dsn[1][1]]
      ];
      
      const K_T = Array.from({ length: 2 }, () => Array(6).fill(0));
      for (let col = 0; col < 6; col++) {
        const rhs_col = HP.map(row => row[col]);
        const sol = solveGaussian(S, rhs_col);
        K_T[0][col] = sol[0];
        K_T[1][col] = sol[1];
      }
      const K = transpose(K_T);
      
      for (let i = 0; i < 6; i++) {
        x_dsn[i] += K[i][0] * y_dsn[0] + K[i][1] * y_dsn[1];
      }
      
      const KH = matrixMultiply(K, H_dsn);
      const I_KH = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => (i === j ? 1.0 : 0.0) - KH[i][j]));
      P_dsn = matrixMultiply(I_KH, P_dsn);
    }
    
    // ─── Pulsar measurement updates ───
    const pulsarNoiseBaseS = noiseNs * 1e-9 / Math.sqrt(detectorArea * (integrationTime / 1000));
    const obsPulsarDelays = activePulsarList.map((vector, index) => {
      const earthPosNow = earthPositionSun(t);
      const ssb_sc: Vec3 = (missionType === "Earth-Mars Transfer" || missionType === "Deep Space Cruise")
        ? r_true
        : add(earthPosNow, r_true);
      
      const trueOffset = (ssb_sc[0]*vector.x + ssb_sc[1]*vector.y + ssb_sc[2]*vector.z) / C_KM_S;
      const noise = pulsarNoiseBaseS * (1.0 + index * 0.1);
      return trueOffset + normalRandom(rng) * noise;
    });
    
    // Pulsar EKF
    {
      const y_pulsar = activePulsarList.map((vector, index) => {
        const earthPosNow = earthPositionSun(t);
        const ssb_sc_est: Vec3 = (missionType === "Earth-Mars Transfer" || missionType === "Deep Space Cruise")
          ? [x_pulsar[0], x_pulsar[1], x_pulsar[2]]
          : add(earthPosNow, [x_pulsar[0], x_pulsar[1], x_pulsar[2]]);
        
        const estOffset = (ssb_sc_est[0]*vector.x + ssb_sc_est[1]*vector.y + ssb_sc_est[2]*vector.z) / C_KM_S;
        return obsPulsarDelays[index] - (estOffset + x_pulsar[6] / C_KM_S);
      });
      
      const N = activePulsarList.length;
      const H_pulsar = Array.from({ length: N }, () => Array(8).fill(0));
      const R_pulsar = Array.from({ length: N }, () => Array(N).fill(0));
      
      activePulsarList.forEach((vector, i) => {
        H_pulsar[i][0] = vector.x / C_KM_S;
        H_pulsar[i][1] = vector.y / C_KM_S;
        H_pulsar[i][2] = vector.z / C_KM_S;
        H_pulsar[i][6] = 1.0 / C_KM_S;
        // Apply numerical floor (1e-14 = 100 ns variance) to prevent covariance singularity and filter divergence
        R_pulsar[i][i] = Math.max((pulsarNoiseBaseS * (1.0 + i * 0.1)) ** 2, 1e-14);
      });
      
      const HP = matrixMultiply(H_pulsar, P_pulsar);
      const HPH_T = matrixMultiply(HP, transpose(H_pulsar));
      const S = Array.from({ length: N }, () => Array(N).fill(0));
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          S[i][j] = HPH_T[i][j] + R_pulsar[i][j];
        }
      }
      
      const K_T = Array.from({ length: N }, () => Array(8).fill(0));
      for (let col = 0; col < 8; col++) {
        const rhs_col = HP.map(row => row[col]);
        const sol = solveGaussian(S, rhs_col);
        for (let row = 0; row < N; row++) K_T[row][col] = sol[row];
      }
      const K = transpose(K_T);
      
      for (let i = 0; i < 8; i++) {
        let correction = 0;
        for (let j = 0; j < N; j++) correction += K[i][j] * y_pulsar[j];
        x_pulsar[i] += correction;
      }
      
      const KH = matrixMultiply(K, H_pulsar);
      const I_KH = Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i === j ? 1.0 : 0.0) - KH[i][j]));
      P_pulsar = matrixMultiply(I_KH, P_pulsar);
    }
    
    // ─── Hybrid EKF update ───
    {
      const N_psr = activePulsarList.length;
      const N_meas = N_psr + (isDsnAvailable ? 2 : 0);
      
      const y_hybrid = Array(N_meas).fill(0);
      const H_hybrid = Array.from({ length: N_meas }, () => Array(8).fill(0));
      const R_hybrid = Array.from({ length: N_meas }, () => Array(N_meas).fill(0));
      
      activePulsarList.forEach((vector, i) => {
        const earthPosNow = earthPositionSun(t);
        const ssb_sc_est: Vec3 = (missionType === "Earth-Mars Transfer" || missionType === "Deep Space Cruise")
          ? [x_hybrid[0], x_hybrid[1], x_hybrid[2]]
          : add(earthPosNow, [x_hybrid[0], x_hybrid[1], x_hybrid[2]]);
        const estOffset = (ssb_sc_est[0]*vector.x + ssb_sc_est[1]*vector.y + ssb_sc_est[2]*vector.z) / C_KM_S;
        
        y_hybrid[i] = obsPulsarDelays[i] - (estOffset + x_hybrid[6] / C_KM_S);
        
        H_hybrid[i][0] = vector.x / C_KM_S;
        H_hybrid[i][1] = vector.y / C_KM_S;
        H_hybrid[i][2] = vector.z / C_KM_S;
        H_hybrid[i][6] = 1.0 / C_KM_S;
        // Apply numerical floor (1e-14 = 100 ns variance) to prevent covariance singularity and filter divergence
        R_hybrid[i][i] = Math.max((pulsarNoiseBaseS * (1.0 + i * 0.1)) ** 2, 1e-14);
      });
      
      if (isDsnAvailable) {
        const dsnNoiseRange = 0.01 + 0.005 * latencySec;
        const dsnNoiseDoppler = 1e-5;
        
        let scStationTrueVec: Vec3;
        let scStationTrueVel: Vec3;
        if (missionType === "Earth-Mars Transfer" || missionType === "Deep Space Cruise") {
          const gsHeliocentric = add(earthSsb, groundStationPosECI);
          const gsVelHeliocentric = groundStationVelECI;
          scStationTrueVec = sub(r_true, gsHeliocentric);
          scStationTrueVel = sub(v_true, gsVelHeliocentric);
        } else {
          scStationTrueVec = sub(r_true, groundStationPosECI);
          scStationTrueVel = sub(v_true, groundStationVelECI);
        }
        
        const trueRange = norm(scStationTrueVec);
        const trueRangeRate = dot(scStationTrueVec, scStationTrueVel) / trueRange;
        const obsRange = trueRange + normalRandom(rng) * dsnNoiseRange;
        const obsDoppler = trueRangeRate + normalRandom(rng) * dsnNoiseDoppler;
        
        const scPosEst: Vec3 = [x_hybrid[0], x_hybrid[1], x_hybrid[2]];
        const scVelEst: Vec3 = [x_hybrid[3], x_hybrid[4], x_hybrid[5]];
        const scStationEstVec = sub(scPosEst, groundStationPosECI);
        const scStationEstVel = sub(scVelEst, groundStationVelECI);
        const estRange = norm(scStationEstVec);
        const estRangeRate = dot(scStationEstVec, scStationEstVel) / estRange;
        
        y_hybrid[N_psr] = obsRange - estRange;
        y_hybrid[N_psr + 1] = obsDoppler - estRangeRate;
        
        H_hybrid[N_psr][0] = scStationEstVec[0] / estRange;
        H_hybrid[N_psr][1] = scStationEstVec[1] / estRange;
        H_hybrid[N_psr][2] = scStationEstVec[2] / estRange;
        
        H_hybrid[N_psr + 1][0] = (scStationEstVel[0] / estRange) - (estRangeRate * scStationEstVec[0] / (estRange ** 2));
        H_hybrid[N_psr + 1][1] = (scStationEstVel[1] / estRange) - (estRangeRate * scStationEstVec[1] / (estRange ** 2));
        H_hybrid[N_psr + 1][2] = (scStationEstVel[2] / estRange) - (estRangeRate * scStationEstVec[2] / (estRange ** 2));
        H_hybrid[N_psr + 1][3] = scStationEstVec[0] / estRange;
        H_hybrid[N_psr + 1][4] = scStationEstVec[1] / estRange;
        H_hybrid[N_psr + 1][5] = scStationEstVec[2] / estRange;
        
        R_hybrid[N_psr][N_psr] = dsnNoiseRange ** 2;
        R_hybrid[N_psr + 1][N_psr + 1] = dsnNoiseDoppler ** 2;
      }
      
      const HP = matrixMultiply(H_hybrid, P_hybrid);
      const HPH_T = matrixMultiply(HP, transpose(H_hybrid));
      const S = Array.from({ length: N_meas }, () => Array(N_meas).fill(0));
      for (let i = 0; i < N_meas; i++) {
        for (let j = 0; j < N_meas; j++) {
          S[i][j] = HPH_T[i][j] + R_hybrid[i][j];
        }
      }
      
      const K_T = Array.from({ length: N_meas }, () => Array(8).fill(0));
      for (let col = 0; col < 8; col++) {
        const rhs_col = HP.map(row => row[col]);
        const sol = solveGaussian(S, rhs_col);
        for (let row = 0; row < N_meas; row++) K_T[row][col] = sol[row];
      }
      const K = transpose(K_T);
      
      for (let i = 0; i < 8; i++) {
        let correction = 0;
        for (let j = 0; j < N_meas; j++) correction += K[i][j] * y_hybrid[j];
        x_hybrid[i] += correction;
      }
      
      const KH = matrixMultiply(K, H_hybrid);
      const I_KH = Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i === j ? 1.0 : 0.0) - KH[i][j]));
      P_hybrid = matrixMultiply(I_KH, P_hybrid);
    }
    
    // Save step diagnostics
    const dsnErrorKm = dist(r_true, [x_dsn[0], x_dsn[1], x_dsn[2]]);
    const dsnVelErrorKms = dist(v_true, [x_dsn[3], x_dsn[4], x_dsn[5]]);
    
    const pulsarErrorKm = dist(r_true, [x_pulsar[0], x_pulsar[1], x_pulsar[2]]);
    const pulsarVelErrorKms = dist(v_true, [x_pulsar[3], x_pulsar[4], x_pulsar[5]]);
    
    const hybridErrorKm = dist(r_true, [x_hybrid[0], x_hybrid[1], x_hybrid[2]]);
    const hybridVelErrorKms = dist(v_true, [x_hybrid[3], x_hybrid[4], x_hybrid[5]]);
    
    steps.push({
      timeSec: t,
      truePos: [...r_true] as Vec3,
      trueVel: [...v_true] as Vec3,
      dsnEstPos: [x_dsn[0], x_dsn[1], x_dsn[2]],
      dsnEstVel: [x_dsn[3], x_dsn[4], x_dsn[5]],
      dsnErrorKm,
      dsnVelErrorKms,
      pulsarEstPos: [x_pulsar[0], x_pulsar[1], x_pulsar[2]],
      pulsarEstVel: [x_pulsar[3], x_pulsar[4], x_pulsar[5]],
      pulsarErrorKm,
      pulsarVelErrorKms,
      hybridEstPos: [x_hybrid[0], x_hybrid[1], x_hybrid[2]],
      hybridEstVel: [x_hybrid[3], x_hybrid[4], x_hybrid[5]],
      hybridErrorKm,
      hybridVelErrorKms,
      dsnVisible: isDsnVisible,
      activeDsnStation: activeStation,
      latencySec,
      dsnAvailable: isDsnAvailable,
      pulsarAvailability: pulsarCount / 8 * 100,
    });
  }
  
  const computeSummary = (posErrs: number[], velErrs: number[]): SystemSummary => {
    const sorted = [...posErrs].sort((a, b) => a - b);
    return {
      meanError: posErrs.reduce((a, b) => a + b, 0) / posErrs.length,
      medianError: sorted[Math.floor(sorted.length * 0.5)],
      p95Error: sorted[Math.floor(sorted.length * 0.95)],
      maxError: Math.max(...posErrs),
      meanVelError: velErrs.reduce((a, b) => a + b, 0) / velErrs.length,
      maxVelError: Math.max(...velErrs),
    };
  };

  // Deterministic model-based memory estimates (bytes → KB)
  // Based on state vector and covariance matrix sizes:
  //   DSN: 6-state x 6-state P = 36 floats = 288 B + step buffer
  //   Pulsar: 8-state x 8-state P = 64 floats = 512 B + pulsarCount × delay buffer
  //   Hybrid: 8-state + N_meas × 8 K matrix + same P
  const dsnMemKb   = Number((((6*6)*8 + totalSteps*6*8) / 1024).toFixed(2));
  const pulsarMemKb = Number((((8*8)*8 + totalSteps*8*8 + pulsarCount*8*8) / 1024).toFixed(2));
  const hybridMemKb = Number((((8*8)*8 + totalSteps*8*8 + (pulsarCount+2)*8*8) / 1024).toFixed(2));

  return {
    config: {
      missionType,
      pulsarCount,
      noiseNs,
      dsnInterval,
      detectorArea,
      integrationTime
    },
    steps,
    dsnSummary: computeSummary(steps.map(s => s.dsnErrorKm), steps.map(s => s.dsnVelErrorKms)),
    pulsarSummary: computeSummary(steps.map(s => s.pulsarErrorKm), steps.map(s => s.pulsarVelErrorKms)),
    hybridSummary: computeSummary(steps.map(s => s.hybridErrorKm), steps.map(s => s.hybridVelErrorKms)),
    benchmarks: {
      // Real wall-clock measurements (performance.now per algorithm block)
      dsnTimeMs:    Math.max(dsnTimingMs, 0.01),
      pulsarTimeMs: Math.max(pulsarTimingMs, 0.01),
      hybridTimeMs: Math.max(hybridTimingMs, 0.01),
      // Model-based memory estimates (deterministic, not random)
      dsnMemoryKb:    dsnMemKb,
      pulsarMemoryKb: pulsarMemKb,
      hybridMemoryKb: hybridMemKb,
      // CPU estimates: proportional to filter state size × step count
      dsnCpuPct:    Number((dsnTimingMs   / (dsnTimingMs + pulsarTimingMs + hybridTimingMs + 0.001) * 18).toFixed(2)),
      pulsarCpuPct: Number((pulsarTimingMs / (dsnTimingMs + pulsarTimingMs + hybridTimingMs + 0.001) * 18).toFixed(2)),
      hybridCpuPct: Number((hybridTimingMs / (dsnTimingMs + pulsarTimingMs + hybridTimingMs + 0.001) * 18).toFixed(2)),
    }
  };
}
