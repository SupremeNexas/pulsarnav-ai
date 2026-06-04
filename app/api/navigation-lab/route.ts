import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

const C_KM_S = 299_792.458;
const REGIONS: Record<string, [number, number]> = {
  earth_orbit: [6_700, 42_200],
  earth_moon: [42_200, 384_400],
  deep_space: [384_400, 2_000_000],
};

type PulsarVector = { name: string; x: number; y: number; z: number; dm?: number; freq?: number };

function fallbackVectors(): PulsarVector[] {
  return [
    { name: "J0613-0200", x: -0.0598484068, y: 0.9975891828, z: -0.0351282031, dm: 38.7, freq: 326.6 },
    { name: "J1713+0747", x: -0.1982651999, y: -0.9707222, z: 0.1356072304, dm: 15.9, freq: 218.8 },
    { name: "J1909-3744", x: 0.2371160541, y: -0.7544395193, z: -0.6120432898, dm: 10.3, freq: 339.3 },
    { name: "J1744-1134", x: -0.0662459249, y: -0.9773963748, z: -0.2007680354, dm: 3.1, freq: 245.4 },
    { name: "J1012+5307", x: -0.5354242301, y: 0.2711741406, z: 0.7998659134, dm: 9.0, freq: 190.3 },
    { name: "J0030+0451", x: 0.9876174198, y: 0.1320268437, z: 0.0847392747, dm: 4.3, freq: 205.5 },
    { name: "J2317+1439", x: 0.9505931103, y: -0.1798143518, z: 0.2530603437, dm: 21.9, freq: 290.3 },
    { name: "J1640+2224", x: -0.3151496178, y: -0.8691582648, z: 0.3811097337, dm: 18.4, freq: 316.1 },
  ];
}

function loadVectors(): PulsarVector[] {
  const rankedPath = join(process.cwd(), "output", "ranked_pulsars.csv");
  if (!existsSync(rankedPath)) return fallbackVectors();
  const lines = readFileSync(rankedPath, "utf8").trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  const indexes = {
    name: headers.indexOf("name"),
    x: headers.indexOf("x"),
    y: headers.indexOf("y"),
    z: headers.indexOf("z"),
    dm: headers.indexOf("dm"),
    freq: headers.indexOf("median_freq_mhz"),
  };
  if (indexes.name < 0 || indexes.x < 0 || indexes.y < 0 || indexes.z < 0) return fallbackVectors();
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return {
      name: cols[indexes.name],
      x: Number(cols[indexes.x]),
      y: Number(cols[indexes.y]),
      z: Number(cols[indexes.z]),
      dm: indexes.dm >= 0 && cols[indexes.dm] ? Number(cols[indexes.dm]) : 15.0,
      freq: indexes.freq >= 0 && cols[indexes.freq] ? Number(cols[indexes.freq]) : 1400.0,
    };
  }).filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y) && Number.isFinite(row.z));
}

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function gaussian(random: () => number) {
  const u1 = Math.max(random(), 1e-12);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function randomPosition(random: () => number, region: string): [number, number, number] {
  const [low, high] = REGIONS[region] ?? REGIONS.earth_moon;
  const u = gaussian(random);
  const v = gaussian(random);
  const w = gaussian(random);
  const norm = Math.hypot(u, v, w) || 1;
  const radius = low + random() * (high - low);
  return [(u / norm) * radius, (v / norm) * radius, (w / norm) * radius];
}

function dispersionDelay(dm: number, freqMhz: number): number {
  const coeff = 4.148808e3;
  const freq = Math.max(freqMhz, 1.0);
  return coeff * dm * (freq ** -2) * 1e-6; // convert us to seconds
}

function earthPositionSsb(epochMjd: number): [number, number, number] {
  const T = (epochMjd - 51544.5) / 36525.0;
  const a_au = 1.00000011 - 0.00000005 * T;
  const e = 0.01671022 - 0.00003804 * T;
  const varpi_rad = (102.94719 + 0.32327 * T) * Math.PI / 180;
  const M_rad = (357.52911 + 35999.05029 * T - 0.0001559 * T * T) * Math.PI / 180;
  
  let E = M_rad;
  for (let i = 0; i < 5; i++) {
    E = E - (E - e * Math.sin(E) - M_rad) / (1 - e * Math.cos(E));
  }
  
  const cos_v = (Math.cos(E) - e) / (1 - e * Math.cos(E));
  const sin_v = (Math.sqrt(1 - e * e) * Math.sin(E)) / (1 - e * Math.cos(E));
  const v = Math.atan2(sin_v, cos_v);
  
  const r_au = a_au * (1 - e * Math.cos(E));
  const lambda_rad = varpi_rad + v;
  
  const x_ecl = r_au * Math.cos(lambda_rad);
  const y_ecl = r_au * Math.sin(lambda_rad);
  
  const eps = 23.43929111 * Math.PI / 180;
  const x_eq = x_ecl;
  const y_eq = y_ecl * Math.cos(eps);
  const z_eq = y_ecl * Math.sin(eps);
  
  const AU_TO_KM = 149597870.7;
  return [x_eq * AU_TO_KM, y_eq * AU_TO_KM, z_eq * AU_TO_KM];
}

function totalDelay(pos: [number, number, number], vector: PulsarVector, epochMjd: number): number {
  const earth = earthPositionSsb(epochMjd);
  const ssb_x = earth[0] + pos[0];
  const ssb_y = earth[1] + pos[1];
  const ssb_z = earth[2] + pos[2];
  
  const roemer = (ssb_x * vector.x + ssb_y * vector.y + ssb_z * vector.z) / C_KM_S;
  const disp = dispersionDelay(vector.dm ?? 15.0, vector.freq ?? 1400.0);
  return roemer + disp;
}

function solveGaussian(A: number[][], B: number[]): number[] {
  const n = B.length;
  const mat = A.map((row, i) => [...row, B[i]]);
  
  for (let i = 0; i < n; i++) {
    let maxEl = Math.abs(mat[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(mat[k][i]) > maxEl) {
        maxEl = Math.abs(mat[k][i]);
        maxRow = k;
      }
    }
    
    const temp = mat[maxRow];
    mat[maxRow] = mat[i];
    mat[i] = temp;
    
    if (Math.abs(mat[i][i]) < 1e-12) {
      throw new Error("Singular matrix in Gaussian elimination");
    }
    
    for (let k = i + 1; k < n; k++) {
      const c = -mat[k][i] / mat[i][i];
      for (let j = i; j <= n; j++) {
        if (i === j) {
          mat[k][j] = 0;
        } else {
          mat[k][j] += c * mat[i][j];
        }
      }
    }
  }
  
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = mat[i][n] / mat[i][i];
    for (let k = i - 1; k >= 0; k--) {
      mat[k][n] -= mat[k][i] * x[i];
    }
  }
  return x;
}

function earthDelayForVector(earth: [number, number, number], vector: PulsarVector): number {
  return (earth[0] * vector.x + earth[1] * vector.y + earth[2] * vector.z) / C_KM_S;
}

function estimatePosition(
  vectors: PulsarVector[],
  delays: number[],
  epochMjd: number,
  algorithm: string,
  noiseNs: number
): [number, number, number] {
  const nCols = 4;
  const normal = Array.from({ length: nCols }, () => Array(nCols).fill(0));
  const rhs = Array(nCols).fill(0);
  
  const earth = earthPositionSsb(epochMjd);
  
  vectors.forEach((vector, index) => {
    const disp = dispersionDelay(vector.dm ?? 15.0, vector.freq ?? 1400.0);
    // Corrected delay must subtract Earth's SSB delay so estimate is Earth-relative
    const earthDelay = earthDelayForVector(earth, vector);
    const correctedDelay = delays[index] - disp - earthDelay;
    const observed = correctedDelay * C_KM_S;
    
    const row = [vector.x, vector.y, vector.z, 1.0];
    
    let weight = 1.0;
    if (algorithm === "WLS") {
      // Weight inversely proportional to pulsar-specific noise
      const pulsarNoiseS = noiseNs * 1e-9 * (1.0 + index * 0.15);
      weight = 1.0 / Math.max(pulsarNoiseS, 1e-12);
    }
    
    const rowScaled = row.map(v => v * weight);
    const observedScaled = observed * weight;
    
    for (let r = 0; r < nCols; r++) {
      rhs[r] += rowScaled[r] * observedScaled;
      for (let c = 0; c < nCols; c++) {
        normal[r][c] += rowScaled[r] * rowScaled[c];
      }
    }
  });
  
  const sol = solveGaussian(normal, rhs);
  return [sol[0], sol[1], sol[2]];
}

// Matrix helper functions for EKF
function transpose(A: number[][]): number[][] {
  const r = A.length, c = A[0].length;
  const T = Array.from({ length: c }, () => Array(r).fill(0));
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

function matMul(A: number[][], B: number[][]): number[][] {
  const rA = A.length, cA = A[0].length, cB = B[0].length;
  const C = Array.from({ length: rA }, () => Array(cB).fill(0));
  for (let i = 0; i < rA; i++) {
    for (let j = 0; j < cB; j++) {
      let sum = 0;
      for (let k = 0; k < cA; k++) {
        sum += A[i][k] * B[k][j];
      }
      C[i][j] = sum;
    }
  }
  return C;
}

function gravityAcceleration(r: [number, number, number]): [number, number, number] {
  const MU = 398600.4418; // km^3/s^2
  const RE = 6378.137;     // km
  const J2 = 1.08263e-3;   // J2
  const rMag = Math.hypot(r[0], r[1], r[2]);
  
  const accK = [
    -MU * r[0] / (rMag ** 3),
    -MU * r[1] / (rMag ** 3),
    -MU * r[2] / (rMag ** 3)
  ];
  
  const zOverR = r[2] / rMag;
  const factor = 1.5 * J2 * (MU / (rMag**2)) * ((RE / rMag)**2);
  const accJ2 = [
    factor * (5.0 * (zOverR**2) - 1.0) * (r[0] / rMag),
    factor * (5.0 * (zOverR**2) - 1.0) * (r[1] / rMag),
    factor * (5.0 * (zOverR**2) - 3.0) * (r[2] / rMag)
  ];
  
  return [accK[0] + accJ2[0], accK[1] + accJ2[1], accK[2] + accJ2[2]];
}

function gravityGradient(r: [number, number, number]): number[][] {
  const MU = 398600.4418;
  const rMag = Math.hypot(r[0], r[1], r[2]);
  const rMag3 = rMag ** 3;
  const rMag5 = rMag ** 5;
  
  const G = Array.from({ length: 3 }, () => Array(3).fill(0));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const delta_ij = i === j ? 1 : 0;
      G[i][j] = -MU * delta_ij / rMag3 + 3.0 * MU * r[i] * r[j] / rMag5;
    }
  }
  return G;
}

function propagateRK4(r: [number, number, number], v: [number, number, number], dt: number): { r: [number, number, number], v: [number, number, number] } {
  const k1_v = v;
  const k1_a = gravityAcceleration(r);
  
  const r2 = [r[0] + 0.5 * dt * k1_v[0], r[1] + 0.5 * dt * k1_v[1], r[2] + 0.5 * dt * k1_v[2]] as [number, number, number];
  const v2 = [v[0] + 0.5 * dt * k1_a[0], v[1] + 0.5 * dt * k1_a[1], v[2] + 0.5 * dt * k1_a[2]] as [number, number, number];
  const k2_v = v2;
  const k2_a = gravityAcceleration(r2);
  
  const r3 = [r[0] + 0.5 * dt * k2_v[0], r[1] + 0.5 * dt * k2_v[1], r[2] + 0.5 * dt * k2_v[2]] as [number, number, number];
  const v3 = [v[0] + 0.5 * dt * k2_a[0], v[1] + 0.5 * dt * k2_a[1], v[2] + 0.5 * dt * k2_a[2]] as [number, number, number];
  const k3_v = v3;
  const k3_a = gravityAcceleration(r3);
  
  const r4 = [r[0] + dt * k3_v[0], r[1] + dt * k3_v[1], r[2] + dt * k3_v[2]] as [number, number, number];
  const v4 = [v[0] + dt * k3_a[0], v[1] + dt * k3_a[1], v[2] + dt * k3_a[2]] as [number, number, number];
  const k4_v = v4;
  const k4_a = gravityAcceleration(r4);
  
  const rNext = [
    r[0] + (dt / 6.0) * (k1_v[0] + 2.0 * k2_v[0] + 2.0 * k3_v[0] + k4_v[0]),
    r[1] + (dt / 6.0) * (k1_v[1] + 2.0 * k2_v[1] + 2.0 * k3_v[1] + k4_v[1]),
    r[2] + (dt / 6.0) * (k1_v[2] + 2.0 * k2_v[2] + 2.0 * k3_v[2] + k4_v[2])
  ] as [number, number, number];
  
  const vNext = [
    v[0] + (dt / 6.0) * (k1_a[0] + 2.0 * k2_a[0] + 2.0 * k3_a[0] + k4_a[0]),
    v[1] + (dt / 6.0) * (k1_a[1] + 2.0 * k2_a[1] + 2.0 * k3_a[1] + k4_a[1]),
    v[2] + (dt / 6.0) * (k1_a[2] + 2.0 * k2_a[2] + 2.0 * k3_a[2] + k4_a[2])
  ] as [number, number, number];
  
  return { r: rNext, v: vNext };
}

function quantile(values: number[], q: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[index];
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const trials = Math.min(Math.max(Number(params.get("trials") ?? 1000), 1), 5000);
  const pulsars = Math.min(Math.max(Number(params.get("pulsars") ?? 6), 4), 8);
  const noiseNs = Math.max(Number(params.get("noise") ?? 100), 0);
  const region = params.get("region") ?? "earth_moon";
  const algorithm = params.get("algorithm") ?? "WLS";
  const seed = Number(params.get("seed") ?? 42);
  
  const random = rng(seed);
  const selected = loadVectors().slice(0, pulsars);
  const errors: number[] = [];
  const samples = [];
  
  // Base flight epoch
  const flightMjd = 58000.0;

  if (algorithm === "EKF") {
    // -------------------------------------------------------------
    // Extended Kalman Filter trajectory simulation (Chapter 7)
    // -------------------------------------------------------------
    const dt = 10.0; // 10 seconds step size
    
    // Initial Orbit setups based on region
    let r_true: [number, number, number] = [7000.0, 0.0, 0.0];
    let v_true: [number, number, number] = [0.0, 7.54, 0.1];
    let pos_err_init = 15.0; // km initial perturbation
    
    if (region === "earth_moon") {
      r_true = [200000.0, 0.0, 0.0];
      v_true = [0.0, 1.41, 0.05];
      pos_err_init = 500.0;
    } else if (region === "deep_space") {
      r_true = [1500000.0, 0.0, 0.0];
      v_true = [0.0, 0.51, 0.02];
      pos_err_init = 5000.0;
    }
    
    let b_true = 10e-6; // True clock bias (10 microseconds)
    let d_true = 1e-7;  // True clock drift
    
    // Initialize EKF state [rx, ry, rz, vx, vy, vz, b_clk, d_clk]^T
    let x_ekf = [
      r_true[0] + pos_err_init,
      r_true[1] - pos_err_init * 0.7,
      r_true[2] + pos_err_init * 0.5,
      v_true[0] - 0.005,
      v_true[1] + 0.003,
      v_true[2] - 0.002,
      0.0,
      0.0
    ];
    
    // Initialize P covariance matrix (8x8)
    let P = Array.from({ length: 8 }, () => Array(8).fill(0));
    P[0][0] = P[1][1] = P[2][2] = pos_err_init * pos_err_init;
    P[3][3] = P[4][4] = P[5][5] = 0.1;
    P[6][6] = 1e-10;
    P[7][7] = 1e-12;
    
    // Process noise covariance diagonal Q
    const Q_diag = [1e-6, 1e-6, 1e-6, 1e-8, 1e-8, 1e-8, 1e-13, 1e-15];
    
    for (let trial = 0; trial < trials; trial++) {
      const t_epoch = trial * dt;
      const epochMjdNow = flightMjd + t_epoch / 86400.0;
      
      // 1. Propagate true state via RK4 and clock drift
      const trueProp = propagateRK4(r_true, v_true, dt);
      r_true = trueProp.r;
      v_true = trueProp.v;
      b_true += d_true * dt;
      
      // ECI -> SSB transition for measurements
      const earth = earthPositionSsb(epochMjdNow);
      const ssb_pos: [number, number, number] = [
        earth[0] + r_true[0],
        earth[1] + r_true[1],
        earth[2] + r_true[2]
      ];
      
      // 2. Generate simulated measurements
      const measurements = selected.map((vector, index) => {
        const roemer = (ssb_pos[0] * vector.x + ssb_pos[1] * vector.y + ssb_pos[2] * vector.z) / C_KM_S;
        const disp = dispersionDelay(vector.dm ?? 15.0, vector.freq ?? 1400.0);
        const ideal = roemer + disp;
        
        const pulsarNoiseS = noiseNs * 1e-9 * (1.0 + index * 0.15);
        const delay_obs = ideal + b_true + gaussian(random) * pulsarNoiseS;
        return {
          delay_s: delay_obs,
          vector,
          noise_s: pulsarNoiseS
        };
      });
      
      // 3. EKF Predict step
      const r_old: [number, number, number] = [x_ekf[0], x_ekf[1], x_ekf[2]];
      const v_old: [number, number, number] = [x_ekf[3], x_ekf[4], x_ekf[5]];
      const b_old = x_ekf[6];
      const d_old = x_ekf[7];
      
      const predProp = propagateRK4(r_old, v_old, dt);
      x_ekf[0] = predProp.r[0];
      x_ekf[1] = predProp.r[1];
      x_ekf[2] = predProp.r[2];
      x_ekf[3] = predProp.v[0];
      x_ekf[4] = predProp.v[1];
      x_ekf[5] = predProp.v[2];
      x_ekf[6] = b_old + d_old * dt;
      // d_ekf remains constant in prediction
      
      // Transition matrix F (8x8)
      const G = gravityGradient(r_old);
      const F = Array.from({ length: 8 }, () => Array(8).fill(0));
      for (let i = 0; i < 3; i++) {
        F[i][i] = 1.0;
        F[i][i + 3] = dt;
        F[i + 3][i + 3] = 1.0;
        for (let j = 0; j < 3; j++) {
          F[i + 3][j] = G[i][j] * dt;
        }
      }
      F[6][6] = 1.0;
      F[6][7] = dt;
      F[7][7] = 1.0;
      
      // P = F * P * F^T + Q
      let FP = matMul(F, P);
      let FPFT = matMul(FP, transpose(F));
      for (let i = 0; i < 8; i++) {
        FPFT[i][i] += Q_diag[i];
      }
      P = FPFT;
      
      // 4. EKF Measurement Update step
      const N = selected.length;
      const Z = measurements.map(m => m.delay_s * C_KM_S);
      
      const H = Array.from({ length: N }, () => Array(8).fill(0));
      const R = Array.from({ length: N }, () => Array(N).fill(0));
      const expected_Z = Array(N).fill(0);
      const y = Array(N).fill(0);
      
      measurements.forEach((m, i) => {
        const v = m.vector;
        H[i][0] = v.x;
        H[i][1] = v.y;
        H[i][2] = v.z;
        H[i][6] = C_KM_S;
        
        R[i][i] = Math.pow(m.noise_s * C_KM_S, 2);
        
        const disp = dispersionDelay(v.dm ?? 15.0, v.freq ?? 1400.0);
        expected_Z[i] = (x_ekf[0]*v.x + x_ekf[1]*v.y + x_ekf[2]*v.z) + (C_KM_S * earthDelayForVector(earth, v)) + C_KM_S * x_ekf[6] + disp * C_KM_S;
        y[i] = Z[i] - expected_Z[i];
      });
      
      // S = H * P * H^T + R
      const HP = matMul(H, P);
      const HPH_T = matMul(HP, transpose(H));
      const S = Array.from({ length: N }, () => Array(N).fill(0));
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          S[i][j] = HPH_T[i][j] + R[i][j];
        }
      }
      
      // Solve S * K^T = H * P for Kalman gain
      // K^T is N x 8
      const K_T = Array.from({ length: 8 }, () => Array(N).fill(0));
      for (let col = 0; col < 8; col++) {
        const rhs_col = HP.map(row => row[col]);
        const sol = solveGaussian(S, rhs_col);
        for (let row = 0; row < N; row++) {
          K_T[col][row] = sol[row];
        }
      }
      const K = transpose(K_T); // 8 x N
      
      // Update state: x_ekf = x_ekf + K * y
      for (let i = 0; i < 8; i++) {
        let correction = 0;
        for (let j = 0; j < N; j++) {
          correction += K[i][j] * y[j];
        }
        x_ekf[i] += correction;
      }
      
      // Update covariance: P = (I - K * H) * P
      const KH = matMul(K, H);
      const I_KH = Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i === j ? 1.0 : 0.0) - KH[i][j]));
      P = matMul(I_KH, P);
      
      // Record errors
      const error = Math.hypot(x_ekf[0] - r_true[0], x_ekf[1] - r_true[1], x_ekf[2] - r_true[2]);
      errors.push(error);
      
      samples.push({
        trial,
        truePosition: [r_true[0], r_true[1], r_true[2]] as [number, number, number],
        estimated: [x_ekf[0], x_ekf[1], x_ekf[2]] as [number, number, number],
        errorKm: error,
      });
    }
  } else {
    // -------------------------------------------------------------
    // Static Monte Carlo simulations for LS/WLS
    // -------------------------------------------------------------
    for (let trial = 0; trial < trials; trial += 1) {
      const truePosition = randomPosition(random, region);
      const clockBiasS = (random() * 20 - 10) * 1e-6; // -10 to +10 us
      
      const delays = selected.map((vector, index) => {
        const ideal = totalDelay(truePosition, vector, flightMjd);
        const pulsarNoiseS = noiseNs * 1e-9 * (1.0 + index * 0.15);
        return ideal + clockBiasS + gaussian(random) * pulsarNoiseS;
      });
      
      const estimated = estimatePosition(selected, delays, flightMjd, algorithm, noiseNs);
      const error = Math.hypot(estimated[0] - truePosition[0], estimated[1] - truePosition[1], estimated[2] - truePosition[2]);
      
      errors.push(error);
      
      samples.push({
        trial,
        truePosition,
        estimated,
        errorKm: error,
      });
    }
  }

  const bins = Array.from({ length: 16 }, (_, index) => {
    const max = Math.max(...errors);
    const low = (index / 16) * max;
    const high = ((index + 1) / 16) * max;
    return {
      bin: `${low.toFixed(3)}-${high.toFixed(3)}`,
      count: errors.filter((value) => value >= low && value < high).length,
    };
  });

  return NextResponse.json({
    config: { trials, pulsars, noiseNs, region, algorithm, seed },
    pulsars: selected.map((vector) => vector.name),
    summary: {
      meanErrorKm: errors.reduce((sum, value) => sum + value, 0) / errors.length,
      medianErrorKm: quantile(errors, 0.5),
      p95ErrorKm: quantile(errors, 0.95),
      maxErrorKm: Math.max(...errors),
    },
    samples: samples.slice(0, 100), // Return first 100 for fast UI rendering
    rawTrials: samples, // Return all for CSV download
    distribution: bins,
  });
}
