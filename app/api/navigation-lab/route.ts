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
  return coeff * dm * (freq ** -2);
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

function estimatePosition(vectors: PulsarVector[], delays: number[]): [number, number, number] {
  const nCols = 4;
  const normal = Array.from({ length: nCols }, () => Array(nCols).fill(0));
  const rhs = Array(nCols).fill(0);
  
  vectors.forEach((vector, index) => {
    const correctedDelay = delays[index] - dispersionDelay(vector.dm ?? 15.0, vector.freq ?? 1400.0);
    const observed = correctedDelay * C_KM_S;
    
    const row = [vector.x, vector.y, vector.z, 1.0];
    
    for (let r = 0; r < nCols; r++) {
      rhs[r] += row[r] * observed;
      for (let c = 0; c < nCols; c++) {
        normal[r][c] += row[r] * row[c];
      }
    }
  });
  
  const sol = solveGaussian(normal, rhs);
  return [sol[0], sol[1], sol[2]];
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
  const seed = Number(params.get("seed") ?? 42);
  const random = rng(seed);
  const selected = loadVectors().slice(0, pulsars);
  const errors: number[] = [];
  const samples = [];
  const flightMjd = 58000.0;

  for (let trial = 0; trial < trials; trial += 1) {
    const truePosition = randomPosition(random, region);
    const clockBiasS = (random() * 20 - 10) * 1e-6; // -10 to +10 us
    const delays = selected.map((vector) => {
      const ideal = totalDelay(truePosition, vector, flightMjd);
      return ideal + clockBiasS + gaussian(random) * noiseNs * 1e-9;
    });
    const estimated = estimatePosition(selected, delays);
    const error = Math.hypot(estimated[0] - truePosition[0], estimated[1] - truePosition[1], estimated[2] - truePosition[2]);
    errors.push(error);
    if (trial < 12) {
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
    config: { trials, pulsars, noiseNs, region, seed },
    pulsars: selected.map((vector) => vector.name),
    summary: {
      meanErrorKm: errors.reduce((sum, value) => sum + value, 0) / errors.length,
      medianErrorKm: quantile(errors, 0.5),
      p95ErrorKm: quantile(errors, 0.95),
      maxErrorKm: Math.max(...errors),
    },
    samples,
    distribution: bins,
  });
}
